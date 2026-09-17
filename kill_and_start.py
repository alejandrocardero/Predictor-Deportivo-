import subprocess
import time
import os
import signal

# Kill any process on port 3000
print("Checking for processes on port 3000...")
result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
pids_to_kill = []
for line in result.stdout.split('\n'):
    if ':3000' in line and 'LISTENING' in line:
        parts = line.split()
        pid = parts[-1]
        pids_to_kill.append(int(pid))
        print(f"Found PID {pid} on port 3000")

# Kill them
for pid in pids_to_kill:
    try:
        os.kill(pid, signal.SIGTERM)
        print(f"Killed PID {pid}")
    except Exception as e:
        print(f"Could not kill PID {pid}: {e}")

time.sleep(2)

# Start the server
print("Starting server...")
proc = subprocess.Popen(
    ['npx', 'tsx', 'server.ts'],
    cwd='D:\\Proyectos\\pronósticos-deportivos-ia',
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)
print(f"Server started with PID {proc.pid}")

# Wait for server to start
time.sleep(3)

# Test the endpoint
print("Testing /api/upcoming-matches...")
try:
    result = subprocess.run(
        ['curl', '-s', 'http://localhost:3000/api/upcoming-matches'],
        capture_output=True, text=True, timeout=10
    )
    print(f"Endpoint response: {result.stdout[:500]}")
    print(f"Endpoint stderr: {result.stderr[:200] if result.stderr else 'none'}")
except Exception as e:
    print(f"Error connecting: {e}")

# Keep running for a bit
time.sleep(5)
print("Done. Server should still be running.")