import sys, traceback, os
os.environ["PYTHONIOENCODING"] = "utf-8"

print("--- Import assessment_system ---")
try:
    from assessment_system import get_assessment_api, VALID_PROFILES
    print("OK: imported")
except Exception:
    traceback.print_exc(); sys.exit(1)

print("--- Instantiate API ---")
try:
    api = get_assessment_api()
    print("OK: singleton created")
except Exception:
    traceback.print_exc(); sys.exit(1)

print("--- Get questions ---")
try:
    qs = api.get_assessment_questions("fr")
    print("OK:", len(qs), "questions returned")
    q0 = qs[0]
    required_keys = {"id", "question", "options"}
    missing = required_keys - set(q0.keys())
    if missing:
        print("WARNING: first question missing keys:", missing)
    else:
        print("OK: first question keys:", list(q0.keys()))
except Exception:
    traceback.print_exc(); sys.exit(1)

print("--- Dummy scoring ---")
try:
    answers = {str(q["id"]): "A" for q in qs[:5]}
    result = api.submit_assessment(answers=answers)
    print("OK: profile=", result.get("primary_profile"), "scores=", result.get("scores"))
except Exception:
    traceback.print_exc(); sys.exit(1)

print("PASS: Assessment system is healthy")
