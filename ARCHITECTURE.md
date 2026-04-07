# Subul — Architecture Documentation

## 🎯 Overview

Subul is an AI-powered certification roadmap generator that helps users discover their cloud/tech profile and generates personalized learning paths through a multi-phase assessment system.

**Core Components:**
1. **Assessment System** — Detects user profile (Cloud, Cyber, AI, IoT)
2. **Level Evaluation** — Determines skill level (Débutant → Expert)
3. **Roadmap Generation** — Creates personalized certification roadmap
4. **Coach Agent** — Provides AI tutoring and guidance

---

## 📁 Project Structure

```
roadmap_Agent/
├── frontend/                    # React + TypeScript UI
│   ├── App.tsx                 # Landing page with soft animations
│   ├── AssessmentModal.tsx     # Profile detection quiz
│   ├── QuizFlowManager.tsx     # Orchestrates quiz → roadmap flow
│   ├── QuizNiv.tsx             # Level evaluation (12 questions)
│   ├── RoadmapView.tsx         # Generated roadmap display
│   ├── CoachChat.tsx           # AI coach chat interface
│   ├── ProgressDashboard.tsx   # User progress tracking
│   ├── ai-agent.service.ts     # API client
│   └── design-system.ts        # Soft UI design tokens
│
├── src/agents/                 # (empty) LangGraph agent definitions
├── src/api/                    # (empty) Additional API modules
├── src/config/                 # (empty) Configuration
├── src/graph/                  # (empty) LangGraph workflows
│
├── langchain_agent.py          # Core AI agent (roadmap generation)
├── langchain_api_server.py     # FastAPI server (all endpoints)
├── assessment_system.py        # Assessment logic + skill gap analysis
├── memory_management.py        # CosmosDB persistence
├── search_index_manager.py     # Azure Search integration
├── questions.json              # Assessment questions database
├── fallback_roadmaps.json      # Backup roadmap templates
└── requirements.txt            # Python dependencies
```

---

## 🔄 User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: PROFILE DETECTION                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ User lands  │───▶│ Clicks      │───▶│ AssessmentModal.tsx │  │
│  │ on App.tsx  │    │ "Démarrer"  │    │ 12 questions        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                           │                                       │
│                           ▼                                       │
│              ┌──────────────────────┐                            │
│              │ POST /assessment/    │                            │
│              │        questions       │                            │
│              │ (from questions.json  │                            │
│              │  or dynamic LLM gen)   │                            │
│              └──────────────────────┘                            │
│                           │                                       │
│                           ▼                                       │
│              ┌──────────────────────┐                            │
│              │ POST /assessment/    │                            │
│              │        submit        │                            │
│              │ + confidence data    │                            │
│              │ → ProfileResult      │                            │
│              └──────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: LEVEL EVALUATION                                        │
│  ┌─────────────────────┐    ┌─────────────────────────────┐   │
│  │ QuizFlowManager.tsx │───▶│ QuizNiv.tsx                   │   │
│  │ receives profile    │    │ Profile-specific questions    │   │
│  │ (cloud/cyber/ai/iot)│    │ (3 per profile = 12 total)    │   │
│  └─────────────────────┘    └─────────────────────────────┘   │
│                                     │                           │
│                                     ▼                           │
│                          ┌────────────────────┐                │
│                          │ POST /level/       │                │
│                          │      questions     │                │
│                          │      evaluate      │                │
│                          │ → LevelResult      │                │
│                          └────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: ROADMAP GENERATION                                    │
│  ┌─────────────────────┐    ┌─────────────────────────────┐   │
│  │ QuizFlowManager.tsx │───▶│ POST /generate (streaming)  │   │
│  │                     │    │                             │   │
│  └─────────────────────┘    │ LangChain agent:            │   │
│                             │ 1. Build AgentState         │   │
│                             │ 2. Run LangGraph workflow   │   │
│                             │ 3. Pydantic validation      │   │
│                             │ 4. CriticAgent scoring      │   │
│                             │ 5. Fallback if needed       │   │
│                             │ → RoadmapOutput (SSE)       │   │
│                             └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: COACH & PROGRESS                                      │
│  ┌─────────────┐    ┌─────────────────────────────────────────┐ │
│  │ RoadmapView │───▶│ CoachChat.tsx                           │ │
│  │ displays    │    │ POST /coach/message                     │ │
│  │ roadmap     │    │                                         │ │
│  └─────────────┘    │ Context-aware AI coach with roadmap     │ │
│                     │ memory from current session             │ │
│                     └─────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────┐    ┌─────────────────────────────────────────┐ │
│  │ User clicks │───▶│ ProgressDashboard.tsx                   │ │
│  │ "Progrès"   │    │ GET /progress/{user_id}                 │ │
│  └─────────────┘    │ Shows all past sessions + progress      │ │
│                     └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Component Details

### 1. Assessment System (`assessment_system.py`)

**Purpose:** Detect user's primary profile across 4 domains

**Key Classes:**
```python
class AssessmentSystem:
    - get_all_questions()          # Returns 12 shuffled questions
    - calculate_profile()          # Scores answers → ProfileResult
    - Adaptive assessment support  # CAT (Computer Adaptive Testing)

class SkillGapAnalyzer:
    - analyze_gaps()               # Identifies weak areas
    - generate_learning_path()     # Recommends resources

class ConfidenceScorer:
    - apply_confidence_weights()   # Adjusts scores by user confidence

class DynamicQuestionGenerator:
    - generate_questions()         # LLM-generated fresh questions
```

**API Endpoints:**
- `POST /api/roadmap/assessment/questions` — Get questions
- `POST /api/roadmap/assessment/submit` — Submit answers + get profile
- `POST /api/roadmap/assessment/skill-gaps` — Get detailed gap analysis
- `POST /api/roadmap/assessment/dynamic-questions` — Generate fresh questions

**Data Flow:**
```
User answers → calculate_profile() → 
    ProfileResult {
        primary_profile: "cloud",
        scores: {cloud: 85, cyber: 45, ai: 30, iot: 10},
        strengths: ["Architecture cloud"],
        weaknesses: ["Sécurité réseau"],
        recommended_first_cert: "AZ-900"
    }
```

---

### 2. Level Evaluation (`QuizNiv.tsx` + backend)

**Purpose:** Determine skill level within detected profile

**Flow:**
1. Frontend requests profile-specific questions
2. Backend returns 12 questions (3 per sub-domain)
3. User answers → POST /level/evaluate
4. Returns level: Débutant / Débutant+ / Intermédiaire / Intermédiaire+ / Expert

**Scoring:**
- Correct answers → +10 points per question
- Level thresholds: 0-30 (Débutant), 31-60 (Intermédiaire), 61-100 (Expert)

---

### 3. Roadmap Generation (`langchain_agent.py`)

**Architecture: LangGraph Workflow**

```
┌───────────────────────────────────────────────────────────────┐
│                    LangGraph Agent Flow                       │
│                                                               │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  START  │───▶│ Build State │───▶│  LLM Generation     │  │
│  │         │    │ (profile +  │    │  (roadmap_node)     │  │
│  └─────────┘    │  level)     │    │                     │  │
│                 └─────────────┘    └─────────────────────┘  │
│                                              │                │
│                              ┌───────────────┘                │
│                              ▼                                │
│                   ┌──────────────────────┐                   │
│                   │ Pydantic Validation  │                   │
│                   │ (RoadmapOutput)      │                   │
│                   └──────────────────────┘                   │
│                              │                                │
│               ┌──────────────┴──────────────┐                 │
│               ▼                              ▼                │
│    ┌─────────────────────┐      ┌─────────────────────┐       │
│    │  Validation OK      │      │  Validation Error   │       │
│    │  → CriticAgent      │      │  → Retry with error │       │
│    │     scoring         │      │     context         │       │
│    └─────────────────────┘      └─────────────────────┘       │
│               │                                              │
│               ▼                                              │
│    ┌─────────────────────┐                                   │
│    │ Score >= 7?         │                                   │
│    │ Yes: Return roadmap │                                   │
│    │ No:  Auto-correct   │                                   │
│    └─────────────────────┘                                   │
│                                                              │
│  Fallback: If all retries fail → fallback_roadmaps.json     │
└───────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Pydantic Validation:** Every LLM output validated against `RoadmapOutput` schema
- **CriticAgent:** Scores roadmap 1-10, triggers auto-correction if < 7
- **Streaming:** SSE (Server-Sent Events) for real-time roadmap delivery
- **CERT_RESOURCES:** Hardcoded links/prices for 40+ certifications
- **Memory:** CosmosDB persistence for user history

**Output Schema (`RoadmapOutput`):**
```python
{
    roadmap_title: str,
    roadmap_summary: str,
    total_estimated_weeks: int,
    total_certifications: int,
    phases: [{
        phase_number: int,
        phase_name: str,
        duration_weeks: int,
        certifications: [{
            ordre: int,
            nom: str,
            code: str,
            provider: str,
            heures_etude: int,
            plan_semaine: [...],
            prix_examen_eur: str,      
            lien_formation: str,        
            lien_inscription: str      
        }]
    }],
    debouches: [{
        titre_poste: str,
        salaire_moyen_eur: str,
        entreprises_type: [...]
    }]
}
```

---

### 4. Coach Agent (`CoachChat.tsx` + backend)

**Purpose:** AI tutor for certification questions

**Features:**
- Context-aware (knows user's current roadmap)
- Remembers conversation history per session
- Can answer certification-specific questions
- Provides study tips and encouragement

**API:** `POST /api/roadmap/coach/message`

```typescript
interface CoachMessageRequest {
    session_id: string;
    user_id: string;
    message: string;
    roadmap_context?: string;  
}
```

**System Prompt:**
```
Tu es Coach Subul, un mentor bienveillant pour les certifications cloud.
Tu connais le parcours de l'apprenant et tu l'aides à progresser.
```

---

### 5. Progress Tracking (`ProgressDashboard.tsx`)

**Purpose:** Show user's learning journey

**API:** `GET /api/roadmap/progress/{user_id}`

**Features:**
- Lists all past sessions
- Shows completed/in-progress certifications
- Tracks XP and achievements
- Compares progress across attempts

---

## 🎨 Frontend Architecture

### Soft Design System (New)

```typescript
// design-system.ts exports:
colors: {
    primary: { 50: '#f5f3ff', 100: '#ede9fe', ... 900: '#4c1d95' },
    secondary: { cloud: '#60a5fa', cyber: '#f87171', ai: '#a78bfa', iot: '#34d399' }
}
glass: {
    light: { background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)' }
}
gradients: {
    soft: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)',
    primary: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)'
}
animations: {
    fadeIn, slideUp, slideInRight, scaleIn, float, pulse, shimmer
}
```

### Component Hierarchy

```
App.tsx (Landing)
    ├── BackgroundBlobs (animated floating shapes)
    ├── DomainBadges (hover effects)
    ├── PrimaryButton (shine effect)
    └── SecondaryButtons

QuizFlowManager (Orchestrator)
    ├── AssessmentModal (Phase 1)
    │   └── Confidence Slider overlay
    ├── QuizNiv (Phase 2)
    └── RoadmapView (Phase 3)
        └── Certification cards with weekly plans

CoachChat (Separate modal)
ProgressDashboard (Separate modal)
```

---

## 🔌 API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/roadmap/assessment/questions` | POST | Get assessment questions |
| `/api/roadmap/assessment/submit` | POST | Submit answers, get profile |
| `/api/roadmap/assessment/skill-gaps` | POST | Get skill gap analysis |
| `/api/roadmap/assessment/dynamic-questions` | POST | Generate fresh LLM questions |
| `/api/roadmap/level/questions` | POST | Get level evaluation questions |
| `/api/roadmap/level/evaluate` | POST | Evaluate level answers |
| `/api/roadmap/generate` | POST | Generate roadmap (SSE streaming) |
| `/api/roadmap/progress/{user_id}` | GET | Get user progress |
| `/api/roadmap/progress/record` | POST | Record session progress |
| `/api/roadmap/coach/message` | POST | Send message to coach |
| `/api/roadmap/benchmark/{user_id}` | GET | Get percentile rankings |

---

## 🧠 Enhanced Features (Recently Added)

### 1. Skill Gap Analysis
- Analyzes weak domains after assessment
- Generates learning path with time estimates
- Shows priority levels (critique/important/mineur)

### 2. Confidence Scoring
- User rates confidence 1-5 per answer
- Adjusts domain scores based on confidence
- Better calibration of actual knowledge

### 3. Dynamic Question Generation
- Azure Search + LLM for fresh questions
- Personalized based on profile
- Mix of classic + LLM questions

### 4. Benchmarking System
- Compares scores to peer group
- Shows percentile rankings
- (Note: Hidden from UI per user request)

---

## 🗄️ Data Persistence

### User ID Strategy
```typescript
const userId = localStorage.getItem('subul_user_id') || 
               `user_${Date.now()}_${random()}`
```

### CosmosDB Schema
```
Container: roadmap-sessions
    - Partition key: /user_id
    - Items: Session documents with:
        - profile, level, roadmap
        - timestamps, scores
        - progress tracking
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- Azure OpenAI access
- Azure CosmosDB (optional, for persistence)
- Azure Search (optional, for dynamic questions)

### Backend Setup
```bash
cd roadmap_Agent
pip install -r requirements.txt
# Set .env variables
python langchain_api_server.py  # Runs on :8002
```

### Frontend Setup
```bash
cd roadmap_Agent/frontend
npm install
npm run dev  # Runs on :5173
```

---

## 📊 Current State Summary

✅ **Working:**
- Profile detection (12 questions)
- Level evaluation (per profile)
- Roadmap generation (streaming)
- Coach agent (context-aware)
- Progress tracking
- Soft UI design (glassmorphism)
- Confidence scoring
- Skill gap analysis

🔧 **Architecture:**
- FastAPI backend with LangGraph
- React + TypeScript frontend
- Azure OpenAI for LLM
- Optional Azure Search/CosmosDB
- Pydantic validation throughout
- CriticAgent for quality control

🎨 **Design:**
- Soft color palette (purple/lavender)
- Glassmorphism effects
- Smooth animations (CSS + React state)
- Responsive layout
- Micro-interactions on all buttons
