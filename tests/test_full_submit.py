"""
Full simulation of the assessment submit flow — same code path as the API endpoint.
"""
import sys
from assessment_system import get_assessment_api

api = get_assessment_api()

# Step 1: get questions (same as /assessment/questions)
questions = api.get_assessment_questions("fr")
print(f"Questions: {len(questions)} returned")

# Step 2: build fake answers (A for every question)
answers = {str(q["id"]): "A" for q in questions}

# Step 3: submit (same as /assessment/submit without confidence)
result = api.submit_assessment(answers=answers, dynamic_questions=None)

print("primary_profile:", result.get("primary_profile"))
print("scores:", result.get("scores"))
print("strengths:", result.get("strengths"))
print("weaknesses:", result.get("weaknesses"))
print("summary:", result.get("summary", "")[:80])
print("recommended_first_certification:", result.get("recommended_first_certification"))

# Step 4: submit with dynamic questions (LLM-generated bank path)
dynamic_q = [
    {
        "id": 1,
        "domain": "cloud",
        "question": "Test?",
        "options": {"A": "a", "B": "b", "C": "c", "D": "d"},
        "scores": {
            "A": {"cloud": 10, "cyber": 0, "ai": 0, "iot": 0},
            "B": {"cloud": 0, "cyber": 10, "ai": 0, "iot": 0},
            "C": {"cloud": 0, "cyber": 0, "ai": 10, "iot": 0},
            "D": {"cloud": 0, "cyber": 0, "ai": 0, "iot": 10},
        }
    }
]
result2 = api.submit_assessment(answers={"1": "A"}, dynamic_questions=dynamic_q)
print("\nDynamic-questions path primary_profile:", result2.get("primary_profile"))

print("\nPASS: Full submit flow OK")
