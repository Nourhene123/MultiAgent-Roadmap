"""
n8n_routes.py — Integration endpoints for n8n automation workflows

Provides:
    - GET /api/n8n/inactive-users — Retrieve users inactive for N days
    - POST /api/n8n/webhook-test — Test endpoint for n8n connectivity
    - POST /api/n8n/record-email-sent — Webhook from n8n when email is sent

n8n Workflow "Follow-up automatisé":
    1. Schedule Trigger (weekly, e.g. Friday 9am)
    2. HTTP Request → GET /api/n8n/inactive-users?days=7
    3. For each user:
       - Send email via SendGrid/Resend
       - POST /api/n8n/record-email-sent (tracking)
"""

import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query

from backend.agents.roadmap_agent import LangChainRoadmapAgent
from backend.memory.manager import RoadmapMemoryManager, CosmosDBAdapter

router = APIRouter(prefix="/api/n8n", tags=["n8n-automation"])

# Global reference to agent (injected from server)
_agent: Optional[LangChainRoadmapAgent] = None


def set_n8n_agent(agent: LangChainRoadmapAgent):
    """Called during server startup to inject the agent instance."""
    global _agent
    _agent = agent


def _get_memory_manager() -> Optional[RoadmapMemoryManager]:
    """Safely get the memory manager from the agent."""
    if _agent is None:
        return None
    return getattr(_agent, "_cosmos_memory", None)


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST/RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class InactiveUser(BaseModel):
    user_id: str
    email: Optional[str] = None          # registered via /api/n8n/register-email
    last_session_date: str
    days_inactive: int
    last_email_sent: Optional[str] = None  # ISO timestamp — used by n8n to skip recently-contacted users
    profile: Optional[str] = None
    level: Optional[str] = None
    roadmap_title: Optional[str] = None
    completed_certs: List[str] = Field(default_factory=list)


class RegisterEmailRequest(BaseModel):
    user_id: str
    email: str = Field(..., description="User email address for re-engagement notifications")


class InactiveUsersResponse(BaseModel):
    users: List[InactiveUser]
    total: int
    days_threshold: int
    generated_at: str


class EmailSentRequest(BaseModel):
    user_id: str
    email_type: str = Field(default="reengagement", description="reengagement | reminder | milestone")
    sent_at: Optional[str] = None
    provider: str = Field(default="sendgrid", description="sendgrid | resend | smtp")
    message_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class EmailSentResponse(BaseModel):
    success: bool
    recorded_at: str
    user_id: str


class WebhookTestResponse(BaseModel):
    status: str
    message: str
    timestamp: str
    agent_ready: bool
    cosmos_ready: bool


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health")
async def n8n_health_check():
    """Health check for n8n to verify connectivity."""
    mm = _get_memory_manager()
    return WebhookTestResponse(
        status="ok",
        message="n8n integration endpoints are accessible",
        timestamp=datetime.utcnow().isoformat(),
        agent_ready=_agent is not None,
        cosmos_ready=mm is not None and mm.db.container is not None,
    )


@router.get("/inactive-users", response_model=InactiveUsersResponse)
async def get_inactive_users(
    days: int = Query(default=7, ge=1, le=90, description="Number of days of inactivity"),
    limit: int = Query(default=100, ge=1, le=500, description="Maximum users to return"),
):
    """
    Get users who haven't had a session in the last N days.
    
    n8n uses this to trigger re-engagement emails.
    """
    mm = _get_memory_manager()
    if mm is None:
        raise HTTPException(status_code=503, detail="Cosmos DB memory not available")
    
    if not mm.db.container:
        raise HTTPException(status_code=503, detail="Cosmos DB container not initialized")
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    inactive_users: List[InactiveUser] = []
    
    try:
        # Query all roadmap_user_* documents
        query = "SELECT * FROM c WHERE c.type = 'roadmap_session'"
        items = mm.db.container.query_items(query=query, enable_cross_partition_query=True)
        
        async for item in items:
            sessions = item.get("sessions", [])
            if not sessions:
                continue
            
            # Get most recent session
            last_session = max(sessions, key=lambda s: s.get("timestamp", "1970-01-01"))
            last_date_str = last_session.get("timestamp", "")
            
            try:
                last_date = datetime.fromisoformat(last_date_str.replace("Z", "+00:00"))
                # Remove timezone for comparison
                last_date = last_date.replace(tzinfo=None)
            except (ValueError, AttributeError):
                continue
            
            if last_date < cutoff_date:
                user_id = item.get("id", "").replace("roadmap_user_", "")
                days_inactive = (datetime.utcnow() - last_date).days

                inactive_users.append(InactiveUser(
                    user_id=user_id,
                    email=item.get("email"),                     # registered email (may be None)
                    last_session_date=last_date_str,
                    days_inactive=days_inactive,
                    last_email_sent=item.get("last_email_sent"), # lets n8n skip recently-emailed users
                    profile=last_session.get("profile"),
                    level=last_session.get("level"),
                    roadmap_title=last_session.get("roadmap_title"),
                    completed_certs=item.get("completed_certs", []),
                ))
        
        # Sort by most inactive first, limit results
        inactive_users.sort(key=lambda u: u.days_inactive, reverse=True)
        inactive_users = inactive_users[:limit]
        
        return InactiveUsersResponse(
            users=inactive_users,
            total=len(inactive_users),
            days_threshold=days,
            generated_at=datetime.utcnow().isoformat(),
        )
        
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query inactive users: {exc}")


@router.post("/record-email-sent", response_model=EmailSentResponse)
async def record_email_sent(request: EmailSentRequest):
    """
    Record that an email was sent to a user (called by n8n after sending).
    Stores in Cosmos DB for tracking and preventing duplicate sends.
    """
    mm = _get_memory_manager()
    if mm is None or not mm.db.container:
        # Non-blocking: log but don't fail the webhook
        return EmailSentResponse(
            success=False,
            recorded_at=datetime.utcnow().isoformat(),
            user_id=request.user_id,
        )
    
    try:
        doc = await mm._get_user_doc(request.user_id)
        
        if "email_history" not in doc:
            doc["email_history"] = []
        
        email_record = {
            "type": "email_sent",
            "email_type": request.email_type,
            "sent_at": request.sent_at or datetime.utcnow().isoformat(),
            "provider": request.provider,
            "message_id": request.message_id,
            "metadata": request.metadata or {},
        }
        
        doc["email_history"].append(email_record)
        # Keep last 50 emails
        doc["email_history"] = doc["email_history"][-50:]
        doc["last_email_sent"] = email_record["sent_at"]
        
        await mm.db.container.upsert_item(doc)
        
        return EmailSentResponse(
            success=True,
            recorded_at=datetime.utcnow().isoformat(),
            user_id=request.user_id,
        )
        
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to record email: {exc}")


@router.get("/user/{user_id}/email-history")
async def get_user_email_history(user_id: str):
    """Get email history for a specific user (useful for n8n decision logic)."""
    mm = _get_memory_manager()
    if mm is None or not mm.db.container:
        raise HTTPException(status_code=503, detail="Cosmos DB not available")
    
    try:
        doc = await mm._get_user_doc(user_id)
        email_history = doc.get("email_history", [])
        last_email_sent = doc.get("last_email_sent")
        
        return {
            "user_id": user_id,
            "email_count": len(email_history),
            "last_email_sent": last_email_sent,
            "recent_emails": email_history[-10:],  # Last 10 emails
        }
        
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to get email history: {exc}")


@router.post("/register-email")
async def register_email(request: RegisterEmailRequest):
    """
    Store a user's email address so n8n can send re-engagement emails.

    Call this from the frontend after roadmap generation completes and the user
    opts into email notifications.  The email is persisted in the user's Cosmos
    document and returned by /inactive-users so n8n can use it directly.
    """
    import re
    # Basic email format guard
    if not re.match(r"[^@]+@[^@]+\.[^@]+", request.email):
        raise HTTPException(status_code=422, detail="Invalid email address format")

    mm = _get_memory_manager()
    if mm is None or not mm.db.container:
        # Cosmos not available — return success anyway so the UX isn't blocked
        return {"success": False, "reason": "Cosmos DB not available", "user_id": request.user_id}

    try:
        doc = await mm._get_user_doc(request.user_id)
        doc["email"] = request.email.strip().lower()
        await mm.db.container.upsert_item(doc)
        return {
            "success": True,
            "user_id": request.user_id,
            "email": doc["email"],
            "registered_at": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to register email: {exc}")


@router.get("/user/{user_id}/profile")
async def get_user_profile(user_id: str):
    """
    Return a user's stored profile + email for n8n email personalisation.
    n8n can call this per-user when /inactive-users returns email=null.
    """
    mm = _get_memory_manager()
    if mm is None or not mm.db.container:
        raise HTTPException(status_code=503, detail="Cosmos DB not available")
    try:
        doc = await mm._get_user_doc(user_id)
        sessions = doc.get("sessions", [])
        last = sessions[-1] if sessions else {}
        return {
            "user_id": user_id,
            "email": doc.get("email"),
            "profile": last.get("profile"),
            "level": last.get("level"),
            "roadmap_title": last.get("roadmap_title"),
            "completed_certs": doc.get("completed_certs", []),
            "last_email_sent": doc.get("last_email_sent"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/webhook-test")
async def webhook_test():
    """Test endpoint for n8n to verify webhook connectivity."""
    return {
        "status": "received",
        "timestamp": datetime.utcnow().isoformat(),
        "message": "n8n webhook test successful - your automation can reach the API",
    }
