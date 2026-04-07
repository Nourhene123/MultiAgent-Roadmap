#!/usr/bin/env python3
"""
test_roadmap_agent.py — Test Suite for Quiz-Based Assessment & Roadmap System

Run all tests:
    python test_roadmap_agent.py

Run specific test:
    python test_roadmap_agent.py test_health
    python test_roadmap_agent.py test_assessment
    python test_roadmap_agent.py test_roadmap

Requirements:
    pip install httpx pytest-asyncio
"""

import asyncio
import json
import sys
import os
from typing import Dict, Any

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx

BASE_URL = "http://localhost:8002"


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"


def print_test(name: str):
    print(f"\n{Colors.BLUE}▶ Testing: {name}{Colors.RESET}")


def print_success(msg: str):
    print(f"{Colors.GREEN}✓ {msg}{Colors.RESET}")


def print_error(msg: str):
    print(f"{Colors.RED}✗ {msg}{Colors.RESET}")


def print_warning(msg: str):
    print(f"{Colors.YELLOW}⚠ {msg}{Colors.RESET}")


async def test_health():
    """Test health endpoint."""
    print_test("Health Check")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/api/roadmap/health")
            
            if response.status_code == 200:
                data = response.json()
                print_success(f"Server is running")
                print(f"  Service: {data.get('service')}")
                print(f"  Model Mode: {data.get('model', {}).get('mode', 'unknown')}")
                return True
            else:
                print_error(f"Status {response.status_code}")
                return False
        except Exception as e:
            print_error(f"Connection failed: {e}")
            return False


async def test_model_info():
    """Test model info endpoint."""
    print_test("Model Info")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/api/roadmap/model/info")
            
            if response.status_code == 200:
                data = response.json()
                print_success("Model info retrieved")
                print(f"  Mode: {data.get('mode')}")
                print(f"  Base Deployment: {data.get('base_deployment')}")
                print(f"  Custom Model: {data.get('custom_model_loaded')}")
                return True
            else:
                print_warning(f"Status {response.status_code} - might need to start server first")
                return False
        except Exception as e:
            print_error(f"Failed: {e}")
            return False


async def test_assessment_questions():
    """Test getting assessment questions."""
    print_test("Assessment Questions Generation")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/api/roadmap/assessment/questions",
                json={"lang": "fr"}
            )
            
            if response.status_code == 200:
                data = response.json()
                questions = data.get("questions", [])
                
                if len(questions) == 10:
                    print_success(f"Got {len(questions)} assessment questions")
                    print(f"  Domains: {data.get('domains')}")
                    print(f"  Example Q1: {questions[0].get('question', 'N/A')[:50]}...")
                    return True
                else:
                    print_warning(f"Expected 10 questions, got {len(questions)}")
                    return False
            else:
                print_error(f"Status {response.status_code}: {response.text[:100]}")
                return False
        except Exception as e:
            print_error(f"Failed: {e}")
            return False


async def test_assessment_submit():
    """Test submitting assessment answers and getting profile."""
    print_test("Assessment Submission & Profile Detection")
    
    # Simulate answers that indicate a cloud profile
    answers = {
        "1": "A",  # Cloud
        "2": "B",  # Cloud
        "3": "A",  # Cloud
        "4": "A",  # Cloud
        "5": "B",  # Cyber-ish
        "6": "B",  # Cyber-ish
        "7": "A",  # Cloud-ish
        "8": "D",  # Neutral
        "9": "A",  # AI-ish
        "10": "C"  # Cloud-ish
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/api/roadmap/assessment/submit",
                json={"answers": answers, "lang": "fr"}
            )
            
            if response.status_code == 200:
                data = response.json()
                profile = data.get("primary_profile")
                scores = data.get("scores", {})
                strengths = data.get("strengths", [])
                weaknesses = data.get("weaknesses", [])
                
                if profile:
                    print_success(f"Profile detected: {profile}")
                    print(f"  Scores: Cloud={scores.get('cloud')}%, Cyber={scores.get('cyber')}%, AI={scores.get('ai')}%")
                    print(f"  Strengths: {', '.join(strengths[:2])}...")
                    print(f"  Weaknesses: {', '.join(weaknesses[:2]) if weaknesses else 'None'}")
                    print(f"  Recommended: {data.get('recommended_first_certification')}")
                    return True
                else:
                    print_warning("No profile detected")
                    return False
            else:
                print_error(f"Status {response.status_code}: {response.text[:200]}")
                return False
        except Exception as e:
            print_error(f"Failed: {e}")
            return False


async def test_level_questions():
    """Test level assessment questions."""
    print_test("Level Test Questions")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/api/roadmap/level/questions",
                json={
                    "profile": "cloud",
                    "lang": "fr",
                    "user_id": "test_user"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                questions = data.get("questions", [])
                
                if questions:
                    print_success(f"Generated {len(questions)} technical questions")
                    print(f"  Profile: {data.get('profile')}")
                    print(f"  Sample: {questions[0].get('question', 'N/A')[:60]}...")
                    return True
                else:
                    print_warning("No questions generated")
                    return False
            else:
                print_error(f"Status {response.status_code}")
                return False
        except Exception as e:
            print_error(f"Failed: {e}")
            return False


async def test_level_evaluation():
    """Test level evaluation."""
    print_test("Level Evaluation")
    
    # Mock questions and answers
    questions = [
        {
            "id": 1,
            "question": "What is AWS EC2?",
            "bonne_reponse": "A",
            "explication": "EC2 is Elastic Compute Cloud",
            "difficulte": "facile",
            "points": 1
        },
        {
            "id": 2,
            "question": "What is Azure ARM?",
            "bonne_reponse": "B",
            "explication": "ARM is Azure Resource Manager",
            "difficulte": "moyen",
            "points": 2
        }
    ]
    
    answers = {"1": "A", "2": "B"}  # All correct
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/api/roadmap/level/evaluate",
                json={
                    "profile": "cloud",
                    "questions": questions,
                    "answers": answers,
                    "user_id": "test_user",
                    "session_id": "test_session"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                niveau = data.get("niveau")
                score = data.get("score", {})
                
                print_success(f"Level evaluated: {niveau}")
                print(f"  Score: {score.get('obtenu')}/{score.get('total')} ({score.get('pourcentage')}%)")
                return True
            else:
                print_error(f"Status {response.status_code}")
                return False
        except Exception as e:
            print_error(f"Failed: {e}")
            return False


async def test_roadmap_generation():
    """Test roadmap generation."""
    print_test("Roadmap Generation")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{BASE_URL}/api/roadmap/generate",
                json={
                    "profile": "cloud",
                    "niveau": "Débutant",
                    "profile_data": {
                        "profile": "cloud",
                        "confidence": 0.9,
                        "strengths": ["motivation", "technical_interest"],
                        "recommended_first_certification": "AZ-900"
                    },
                    "level_data": {
                        "niveau": "Débutant",
                        "score": {"pourcentage": 45}
                    },
                    "user_id": "test_user",
                    "session_id": "test_session",
                    "lang": "fr",
                    "use_custom_model": False
                }
            )
            
            if response.status_code == 200:
                # Parse streaming response
                full_roadmap = ""
                for line in response.text.strip().split("\n"):
                    if line:
                        try:
                            chunk = json.loads(line)
                            if chunk.get("status") == "completed":
                                full_roadmap = json.dumps(chunk.get("roadmap", {}), indent=2)
                            else:
                                full_roadmap += chunk.get("chunk", "")
                        except:
                            pass
                
                if full_roadmap:
                    print_success("Roadmap generated")
                    # Try to parse and show key info
                    try:
                        roadmap = json.loads(full_roadmap)
                        print(f"  Title: {roadmap.get('roadmap_title', 'N/A')}")
                        print(f"  Weeks: {roadmap.get('total_estimated_weeks', 'N/A')}")
                        print(f"  Phases: {len(roadmap.get('phases', []))}")
                    except:
                        print(f"  Raw length: {len(full_roadmap)} chars")
                    return True
                else:
                    print_warning("Empty roadmap")
                    return False
            else:
                print_error(f"Status {response.status_code}: {response.text[:200]}")
                return False
        except Exception as e:
            print_error(f"Failed: {e}")
            return False


async def run_all_tests():
    """Run all tests."""
    print("=" * 60)
    print("QUIZ-BASED ASSESSMENT & ROADMAP TEST SUITE")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print()
    
    results = []
    
    # Basic connectivity
    results.append(("Health Check", await test_health()))
    results.append(("Model Info", await test_model_info()))
    
    # Assessment phase (quiz-based)
    results.append(("Assessment Questions", await test_assessment_questions()))
    results.append(("Assessment Submit", await test_assessment_submit()))
    
    # Level test phase
    results.append(("Level Questions", await test_level_questions()))
    results.append(("Level Evaluation", await test_level_evaluation()))
    
    # Roadmap phase
    results.append(("Roadmap Generation", await test_roadmap_generation()))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, r in results if r)
    failed = sum(1 for _, r in results if not r)
    
    for name, result in results:
        status = f"{Colors.GREEN}PASS{Colors.RESET}" if result else f"{Colors.RED}FAIL{Colors.RESET}"
        print(f"  {status}: {name}")
    
    print()
    print(f"Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print(f"\n{Colors.GREEN}🎉 All tests passed!{Colors.RESET}")
    elif failed < len(results) / 2:
        print(f"\n{Colors.YELLOW}⚠️  Some tests failed, but core functionality works{Colors.RESET}")
    else:
        print(f"\n{Colors.RED}❌ Many tests failed - check server logs{Colors.RESET}")
    
    return failed == 0


# Individual test runners
async def run_test(name: str):
    """Run a single test by name."""
    tests = {
        "health": test_health,
        "model": test_model_info,
        "assess_questions": test_assessment_questions,
        "assess_submit": test_assessment_submit,
        "level_questions": test_level_questions,
        "level_eval": test_level_evaluation,
        "roadmap": test_roadmap_generation,
    }
    
    if name in tests:
        success = await tests[name]()
        return 0 if success else 1
    else:
        print(f"Unknown test: {name}")
        print(f"Available: {', '.join(tests.keys())}")
        return 1


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Run specific test
        test_name = sys.argv[1]
        exit_code = asyncio.run(run_test(test_name))
        sys.exit(exit_code)
    else:
        # Run all tests
        success = asyncio.run(run_all_tests())
        sys.exit(0 if success else 1)
