import sys
import socket

# Standard Windows Named Pipe path
PIPE_NAME = r'\\.\pipe\tracky-mouse-control'

# TCP fallback configuration (for cross-elevation scenarios)
# IMPORTANT: If you changed TCP_PORT in electron-main.js, update it here too!
TCP_HOST = '127.0.0.1'
TCP_PORT = 28232

class TrackyMouseController:
    
    @staticmethod
    def _run_command(command):
        """
        Runs a Tracky Mouse CLI command.
        Tries Named Pipe first (fastest), then TCP socket (for cross-elevation).
        
        Named Pipe fails when there's a privilege level mismatch between
        this script and the TrackyMouse app (e.g., app runs as admin, script doesn't).
        In such cases, we automatically fall back to TCP socket.
        """
        # Try Named Pipe first (most efficient when both have same privileges)
        try:
            with open(PIPE_NAME, 'r+b', buffering=0) as f:
                f.write(command.encode('utf-8'))
                response = f.read(1024).decode('utf-8')
                return response == "OK"
        except FileNotFoundError:
            # Pipe not found, try TCP
            pass
        except PermissionError:
            # Cross-elevation issue, try TCP
            pass
        except Exception as e:
            # Any other Named Pipe error, try TCP as fallback
            # print(f"Named Pipe error: {e}, trying TCP...")
            pass
        
        # Fallback to TCP socket (works across elevation boundaries)
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(2)  # 2 second timeout
                s.connect((TCP_HOST, TCP_PORT))
                s.sendall(command.encode('utf-8'))
                response = s.recv(1024).decode('utf-8')
                return response == "OK"
        except ConnectionRefusedError:
            # print("Tracky Mouse is not running.")
            return False
        except socket.timeout:
            # print("Connection to Tracky Mouse timed out.")
            return False
        except Exception as e:
            print(f"Error communicating with Tracky Mouse: {e}")
            return False

    @staticmethod
    def toggle():
        """Toggle head tracking on/off."""
        return TrackyMouseController._run_command("toggle")

    @staticmethod
    def start():
        """Start head tracking."""
        return TrackyMouseController._run_command("start")

    @staticmethod
    def stop():
        """Stop head tracking."""
        return TrackyMouseController._run_command("stop")


# Export convenience functions
def tracky_toggle():
    """Toggle head tracking on/off."""
    return TrackyMouseController.toggle()

def tracky_start():
    """Start head tracking."""
    return TrackyMouseController.start()

def tracky_stop():
    """Stop head tracking."""
    return TrackyMouseController.stop()


# Example usage
if __name__ == "__main__":
    print("Testing TrackyMouse controller...")
    
    print("Starting tracking...")
    if tracky_start():
        print("✓ Successfully started")
    else:
        print("✗ Failed to start")
    
    import time
    time.sleep(2)
    
    print("Stopping tracking...")
    if tracky_stop():
        print("✓ Successfully stopped")
    else:
        print("✗ Failed to stop")
