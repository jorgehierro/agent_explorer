# Assistant Explorer

Assistant Explorer is a comprehensive web-based platform designed to interact with, manage, and discover multiple autonomous AI assistants. It features a modern, responsive user interface and a robust backend for seamless orchestration of assistant-based workflows.

## Features

- **Assistant Chat Interface:** Communicate directly with discovered assistants through a sleek messaging interface.
- **Dynamic Assistant Discovery:** Automatically scan local or remote ports to discover and connect to running assistant services.
- **Automations (Workflows & Playbooks):** Execute complex, orchestrated multi-assistant tasks and predefined playbooks natively from the UI.
- **Assistant Creator:** A built-in graphical designer tool to scaffold, configure, and deploy new custom assistants dynamically without leaving the browser.
- **Admin Dashboard:** Comprehensive administration tools to manage users, assign granular assistant permissions (including specific assistant access, workflow, and playbook roles), and track system activity through an audit log.

## Assistants

Assistant Explorer is built to be agnostic and highly flexible. The platform acts as a central hub designed to interface with any compatible AI assistant you deploy. 

Rather than bundling specific assistants, the system connects to your own ecosystem of assistants. Simply launch your assistants on their respective ports, use the *Discover* feature in the header, and the platform will automatically detect and integrate them into your workspace.

## Getting Started

1. Ensure you have Python installed.
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask application:
   ```bash
   python app.py
   ```
4. Open your web browser and navigate to `http://localhost:5000` (or the port specified by Flask).
5. Log in with your credentials to start discovering assistants.