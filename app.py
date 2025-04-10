from flask import Flask, render_template, request, jsonify
import requests
from config import JIRA_URL, JIRA_API_TOKEN
import webbrowser
import threading

app = Flask(__name__)

def get_jira_headers():
    return {
        "Authorization": f"Bearer {JIRA_API_TOKEN}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/issues')
def get_issues():
    project = request.args.get('project')
    epic = request.args.get('epic')
    assignee = request.args.get('assignee')
    team = request.args.get('team')

    jql_parts = []
    if project:
        jql_parts.append(f'project = "{project}"')
    if epic:
        jql_parts.append(f'"Epic Link" = {epic}')
    if assignee:
        jql_parts.append(f'assignee = {assignee}')
    if team:
        jql_parts.append(f'team = {team}')
        
    jql_parts.append('issuetype != Epic')

    jql = ' AND '.join(jql_parts) if jql_parts else 'ORDER BY updated DESC'
    #print("🔍 JQL being used:", jql)

    url = f"{JIRA_URL}/rest/api/2/search"
    params = {
        "jql": jql,
        "fields": "summary,status,assignee,updated,customfield_11302",
        "maxResults": 100
    }

    response = requests.get(url, headers=get_jira_headers(), params=params)
    
    #print(response.json())
    
    return jsonify(response.json())


@app.route('/api/projects')
def get_projects():
    url = f"{JIRA_URL}/rest/api/2/project"
    response = requests.get(url, headers=get_jira_headers())
    return jsonify(response.json())


@app.route('/api/epics')
def get_epics():
    project = request.args.get('project')
    jql = 'issuetype = Epic'
    if project:
        jql = f'project = "{project}" AND {jql}'

    url = f"{JIRA_URL}/rest/api/2/search"
    params = {
        "jql": jql,
        "fields": "summary",
        "maxResults": 100
    }

    response = requests.get(url, headers=get_jira_headers(), params=params)
    data = response.json()
    return jsonify(data.get("issues", []))


@app.route('/api/assignees')
def get_assignees():
    project = request.args.get('project')
    jql = 'assignee IS NOT EMPTY'
    if project:
        jql = f'project = "{project}" AND {jql}'

    url = f"{JIRA_URL}/rest/api/2/search"
    params = {
        "jql": jql,
        "fields": "assignee",
        "maxResults": 500
    }

    response = requests.get(url, headers=get_jira_headers(), params=params)
    data = response.json()

    seen = set()
    assignees = []
    for issue in data.get("issues", []):
        assignee = issue["fields"].get("assignee")
        if assignee and assignee["name"] not in seen:
            seen.add(assignee["name"])
            assignees.append({
                "name": assignee["name"],
                "displayName": assignee["displayName"]
            })

    return jsonify(assignees)




@app.route('/api/teams')
def get_teams():
    return jsonify([
        { "id": "", "name": "ALL" },         # 👈 means no filter
        { "id": "15", "name": "SYS Team" }   # 👈 hardcoded team
    ])

def open_browser():
    webbrowser.open('http://localhost:5000', new=2)


if __name__ == '__main__':
    # Run the browser opener in a separate thread
    threading.Timer(1, open_browser).start()

    app.run(debug=True)
