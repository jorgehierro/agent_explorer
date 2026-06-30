# Agent Explorer

Agent Explorer is a comprehensive web-based platform designed to interact with, manage, and discover multiple autonomous AI agents. It features a modern, responsive user interface and a robust backend for seamless orchestration of agent-based workflows.

## Features

- **Agent Chat Interface:** Communicate directly with discovered agents through a sleek messaging interface.
- **Dynamic Agent Discovery:** Automatically scan local or remote ports to discover and connect to running agent services.
- **Automations (Workflows & Playbooks):** Execute complex, orchestrated multi-agent tasks and predefined playbooks natively from the UI.
- **Agent Creator:** A built-in graphical designer tool to scaffold, configure, and deploy new custom agents dynamically without leaving the browser.
- **Admin Dashboard:** Comprehensive administration tools to manage users, assign granular agent permissions (including specific agent access, workflow, and playbook roles), and track system activity through an audit log.

## Agents

Agent Explorer is built to be agnostic and highly flexible. The platform acts as a central hub designed to interface with any compatible AI agent you deploy. 

Rather than bundling specific agents, the system connects to your own ecosystem of agents. Simply launch your agents on their respective ports, use the *Discover* feature in the header, and the platform will automatically detect and integrate them into your workspace.

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
5. Log in with your credentials to start discovering agents.