import ast, sys

files = [
    'langchain_agent.py',
    'langchain_api_server.py',
    'assessment_system.py',
]

for f in files:
    try:
        with open(f, encoding='utf-8') as fh:
            src = fh.read()
        ast.parse(src)
        print(f'OK: {f}')
    except SyntaxError as e:
        print(f'SYNTAX ERROR in {f} line {e.lineno}: {e.msg}')
        sys.exit(1)
    except Exception as e:
        print(f'ERROR in {f}: {e}')
        sys.exit(1)

print('All files OK')
