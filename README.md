# MultiAgent Roadmap

> AI-powered certification roadmap generator using LangChain Multi-Agent orchestration

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000.svg)](https://nextjs.org/)
[![LangChain](https://img.shields.io/badge/LangChain-0.1+-green.svg)](https://langchain.com/)

## 🎯 Overview

MultiAgent Roadmap is an intelligent certification planning system that uses multiple specialized AI agents to:

1. **Assess user profile** — Detect dominant IT domain (Cloud, Cybersecurity, AI, IoT)
2. **Evaluate skill level** — Determine experience level (Débutant → Expert)
3. **Generate personalized roadmaps** — Create step-by-step certification plans
4. **Provide AI coaching** — Answer questions about certifications and study strategies
5. **Negotiate modifications** — Adjust roadmaps based on user feedback

## 🏗️ Architecture

### LangGraph Multi-Agent Orchestration

This project uses **LangGraph** to orchestrate multiple specialized AI agents through a stateful workflow graph. Unlike simple LLM chains, LangGraph maintains persistent state across agent interactions and enables complex multi-step reasoning.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MultiAgent Roadmap System                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Critic    │    │   Profile   │    │   Level     │    │   Coach     │ │
│  │   Agent     │    │   Analysis  │    │ Diagnostics │    │   Agent     │ │
│  │             │    │   Agent     │    │   Agent     │    │             │ │
│  │  Validates  │    │  Enriches   │    │  Analyzes   │    │  Converses  │ │
│  │  roadmaps   │    │   profile   │    │   skills    │    │  with user  │ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│         │                  │                  │                  │        │
│         └──────────────────┴──────────────────┘                  │        │
│                            │                                     │        │
│                            ▼                                     ▼        │
│                   ┌─────────────────┐                ┌─────────────────┐  │
│                   │  LangChain      │                │  RoadmapNegotiation│ │
│                   │  RoadmapAgent   │◄───────────────│      Agent      │  │
│                   │                 │   (modifications)                 │  │
│                   └────────┬────────┘                └─────────────────┘  │
│                            │                                             │
│                            ▼                                             │
│                   ┌─────────────────┐                                    │
│                   │  Azure OpenAI   │                                    │
│                   │     LLM         │                                    │
│                   └─────────────────┘                                    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              External Services                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │ Azure Search│    │  Cosmos DB  │    │ Azure OpenAI│                     │
│  │   Index     │    │   Memory    │    │     LLM     │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why LangGraph?

**LangGraph** is a framework for building stateful, multi-actor applications with LLMs. In this project, it solves:

| Problem | LangGraph Solution |
|---------|-------------------|
| Multi-step workflow | StateGraph with conditional edges between phases |
| State persistence | `AgentState` TypedDict maintains context across API calls |
| Agent orchestration | Each node can invoke sub-agents (Critic, ProfileAnalysis, etc.) |
| Retry logic | Built-in error handling and re-invocation |
| Streaming | Real-time roadmap delivery via `ainvoke()` |

### LangGraph Implementation Details

#### 1. AgentState (Shared State Container)

```python
# backend/agents/base.py
class AgentState(TypedDict):
    """State managed by LangGraph throughout the agent lifecycle."""
    messages: List[BaseMessage]      # Conversation history (standard LangGraph field)
    user_id: str
    session_id: str
    profile: Optional[str]           # Detected profile: cloud/cyber/ai/iot
    level: Optional[str]             # Skill level: Débutant/Intermédiaire/Expert
    profile_data: Optional[Dict]       # Enriched profile from ProfileAnalysisAgent
    level_data: Optional[Dict]       # Skill gaps from LevelDiagnosticsAgent
    roadmap_data: Optional[Dict]       # Generated roadmap output
    current_phase: str               # assessment | level_test | generating | complete
    memory_context: str              # Cosmos DB historical context
```

#### 2. RoadmapAgentGraph (The Workflow Engine)

```python
# backend/agents/roadmap_agent.py
class RoadmapAgentGraph:
    """
    LangGraph workflow orchestrating three phases:
    - assessment: Profile detection
    - level_test: Skill evaluation  
    - roadmap: Certification plan generation
    """
    
    def _build_graph(self):
        workflow = StateGraph(AgentState)
        
        # Three nodes = three application phases
        workflow.add_node("assessment", assessment_node)      # Phase 1
        workflow.add_node("level_test", level_test_node)      # Phase 2
        workflow.add_node("roadmap", roadmap_node)            # Phase 3
        
        # Conditional transitions
        workflow.set_entry_point("assessment")
        workflow.add_conditional_edges(
            "assessment",
            lambda s: "level_test" if s.get("profile") else END
        )
        workflow.add_conditional_edges(
            "level_test", 
            lambda s: "roadmap" if s.get("level") else END
        )
        workflow.add_edge("roadmap", END)
        
        return workflow.compile()
```

#### 3. Visual Workflow

```
┌─────────────┐    profile detected     ┌─────────────┐    level evaluated    ┌─────────────┐
│  assessment │ ─────────────────────▶│  level_test │ ────────────────────▶│   roadmap   │
│   (nœud 1)  │                       │   (nœud 2)  │                      │   (nœud 3)  │
└─────────────┘                       └─────────────┘                      └─────────────┘
                                                                             │
                                                                             ▼
                                                                    ┌─────────────────┐
                                                                    │ LLM Generation  │
                                                                    │ + CriticAgent   │
                                                                    │ + Validation    │
                                                                    │ + Resources     │
                                                                    └─────────────────┘
```

#### 4. Integration with Sub-Agents

The `roadmap_node` executes a multi-agent pipeline:

```python
async def roadmap_node(state: AgentState) -> Dict:
    # 1. Enrich with ProfileAnalysisAgent + LevelDiagnosticsAgent (parallel)
    profile_context = await profile_agent.analyze(state["profile_data"])
    level_context = await level_agent.diagnose(state["level_data"])
    
    # 2. Generate roadmap via LLM
    roadmap = await generate_roadmap(
        profile=state["profile"],
        level=state["level"],
        memory_context=f"{profile_context}\n{level_context}"
    )
    
    # 3. CriticAgent validation gate (score ≥ 7 or auto-correct)
    roadmap = await critic_agent.evaluate(roadmap, state["profile"], state["level"])
    
    # 4. Inject authoritative resources (prices/links)
    roadmap = inject_resources(roadmap)
    
    return {"roadmap_data": roadmap, "current_phase": "complete"}
```

#### 5. SessionStateManager (Bridge between API and LangGraph)

```python
# backend/agents/base.py
class SessionStateManager:
    """
    In-memory store mapping session_id → AgentState.
    Each API endpoint updates AgentState so LangGraph always has current context.
    """
    
    def get_or_create(self, session_id: str, user_id: str) -> AgentState:
        # Initialize empty state for new session
        
    def update(self, session_id: str, **fields) -> AgentState:
        # Update state after each API call (assessment submit, level evaluate, etc.)
```

### Agent Collaboration Flow

```
User Assessment ──► ProfileAnalysisAgent ──► LevelDiagnosticsAgent
                                                          │
                                                          ▼
                              ┌──────────────────────────────────────┐
                              │   LangChainRoadmapAgent              │
                              │   ┌─────────────────────────────┐    │
                              │   │  1. Generate roadmap        │    │
                              │   │  2. CriticAgent validates   │    │
                              │   │     (score ≥ 7 or retry)     │    │
                              │   │  3. Inject resources          │    │
                              │   └─────────────────────────────┘    │
                              └──────────────────────────────────────┘
                                              │
                                              ▼
                              ┌──────────────────────────────────────┐
                              │  EvaluationAgent (async)           │
                              │  Grades roadmap quality              │
                              └──────────────────────────────────────┘
                                              │
                                              ▼
                                    RoadmapNegotiationAgent
                                    (multi-turn modifications)
                                              │
                                              ▼
                                        CoachAgent
                                    (Q&A about roadmap)
```

## 📁 Project Structure

```
MultiAgent-Roadmap/
├── backend/                          # Python FastAPI backend
│   ├── app/
│   │   ├── agents/                   # LangChain agent implementations
│   │   │   ├── __init__.py
│   │   │   ├── critic.py             # CriticAgent
│   │   │   ├── profile_analysis.py   # ProfileAnalysisAgent
│   │   │   ├── level_diagnostics.py  # LevelDiagnosticsAgent
│   │   │   ├── evaluation.py         # EvaluationAgent
│   │   │   ├── coach.py              # CoachAgent
│   │   │   ├── assessment_generator.py
│   │   │   └── negotiation.py        # RoadmapNegotiationAgent
│   │   ├── api/                      # FastAPI routes
│   │   │   ├── __init__.py
│   │   │   └── routes.py             # API endpoints
│   │   ├── core/                     # Configuration & constants
│   │   │   ├── __init__.py
│   │   │   ├── config.py             # Settings
│   │   │   └── constants.py          # CERT_RESOURCES, etc.
│   │   ├── models/                   # Pydantic models
│   │   │   ├── __init__.py
│   │   │   ├── roadmap.py            # RoadmapOutput, CertificationOutput
│   │   │   └── assessment.py         # AssessmentQuestion, ProfileData
│   │   └── services/                 # Business logic
│   │       ├── __init__.py
│   │       ├── roadmap_agent.py      # LangChainRoadmapAgent
│   │       ├── assessment.py         # AssessmentAPI
│   │       └── memory.py             # RoadmapMemoryManager
│   └── tests/                        # Test suite
├── frontend/                         # Next.js + TypeScript frontend
│   ├── src/
│   │   ├── components/               # React components
│   │   │   ├── App.tsx
│   │   │   ├── AssessmentModal.tsx
│   │   │   ├── CoachChat.tsx
│   │   │   ├── QuizFlowManager.tsx
│   │   │   ├── QuizNiv.tsx
│   │   │   ├── RoadmapView.tsx
│   │   │   └── ProgressDashboard.tsx
│   │   ├── services/                 # API clients
│   │   │   └── ai-agent.service.ts
│   │   ├── types/                    # TypeScript types
│   │   ├── hooks/                    # Custom React hooks
│   │   └── utils/                    # Utility functions
│   ├── index.html
│   └── package.json
├── data/                             # Static data files
│   ├── questions.json
│   └── fallback_roadmaps.json
├── saved_roadmaps/                   # User saved roadmaps
├── .env                              # Environment variables
├── requirements.txt                  # Python dependencies
└── README.md                         # This file
```

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Azure OpenAI access
- Azure Cosmos DB (optional, for persistence)
- Azure AI Search (optional, for enrichment)

### Backend Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Azure credentials

# Start server
python backend/app/api/routes.py  # or: uvicorn backend.app.api.routes:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## 🎓 Usage Flow

1. **Assessment Phase** — User answers 40 questions covering 4 domains
2. **Profile Detection** — System identifies dominant profile (Cloud/Cyber/AI/IoT)
3. **Level Quiz** — 10 adaptive questions determine experience level
4. **Roadmap Generation** — Multi-agent pipeline creates personalized plan
5. **Negotiation** — User can request modifications ("make it faster", "focus on security")
6. **Coaching** — AI assistant answers questions about certifications

## 🤖 Agents Reference

| Agent | Responsibility | Trigger |
|-------|---------------|---------|
| **CriticAgent** | Quality gate (1-10 scoring) | After roadmap generation |
| **ProfileAnalysisAgent** | Narrative profile enrichment | After assessment submission |
| **LevelDiagnosticsAgent** | Learning gap analysis | After level quiz |
| **EvaluationAgent** | Quality metrics (async) | Post-generation |
| **CoachAgent** | Conversational Q&A | User chat messages |
| **AssessmentQuestionGeneratorAgent** | Generate quiz questions | Assessment start |
| **RoadmapNegotiationAgent** | Multi-turn modifications | User negotiation requests |

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/roadmap/health` | GET | Service health check |
| `/api/roadmap/assessment/questions` | POST | Get assessment questions |
| `/api/roadmap/assessment/submit` | POST | Submit answers, get profile |
| `/api/roadmap/level/questions` | POST | Get level quiz questions |
| `/api/roadmap/level/evaluate` | POST | Submit level answers |
| `/api/roadmap/generate` | POST | Generate roadmap (streaming) |
| `/api/roadmap/coach` | POST | Chat with coach agent |
| `/api/roadmap/negotiate` | POST | Negotiate roadmap changes |

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, LangChain/LangGraph, Pydantic
- **Frontend**: Next.js, TypeScript
- **LLM**: Azure OpenAI (GPT-4o)
- **Vector Search**: Azure AI Search
- **Memory**: Azure Cosmos DB (optional)

## 📄 License

MIT License - see LICENSE file for details.

## 👤 Author

**Nourhene** — [GitHub](https://github.com/Nourhene123)

---

Built with ❤️ using LangChain Multi-Agent orchestration.
