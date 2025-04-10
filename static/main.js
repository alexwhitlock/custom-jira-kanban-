const defaultProjectKey = "LPM";  // 👈 change this to your real project key
const defaultEpic = "";
const defaultTeam = "15";
const defaultAssignee = "";

// Show the filter popup
function openFilter() {
    const popup = document.getElementById("filterPopup");
    popup.style.display = "block";

    // Stop the click inside the popup from closing it immediately
    popup.onclick = function(event) {
        event.stopPropagation();
    };
}

// Load projects on initial page load
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/projects')
        .then(res => res.json())
        .then(projects => {
            const projectSelect = document.getElementById('projectFilter');
            projects.forEach(p => {
                const option = document.createElement('option');
                option.value = p.key;
                option.text = p.name;
                projectSelect.appendChild(option);
            });

            // ✅ Set default project and trigger change
            if (defaultProjectKey) {
                projectSelect.value = defaultProjectKey;
                loadEpicsAssigneesTeams(() => {
                    // ✅ After epics/assignees are loaded, set their defaults
                    document.getElementById('epicFilter').value = defaultEpic;
                    document.getElementById('assigneeFilter').value = defaultAssignee;
                    document.getElementById('teamFilter').value = defaultTeam;

                    // ✅ Load issues with the default filter
                    applyFilters();
                });
            }
        });
});

const assigneeNameToUsername = {};  // global map

// Load epics and assignees for selected project
function loadEpicsAssigneesTeams(callback = null) {
    const project = document.getElementById('projectFilter').value;

    const epicPromise = project ? fetch(`/api/epics?project=${project}`)
        .then(res => res.json())
        .then(epics => {
            const epicSelect = document.getElementById('epicFilter');
            epicSelect.innerHTML = '<option value="">-- Select --</option>';
            epics.forEach(e => {
                const option = document.createElement('option');
                option.value = e.key;
                option.text = e.fields.summary;
                epicSelect.appendChild(option);
            });
        }) : Promise.resolve();

    const assigneePromise = project ? fetch(`/api/assignees?project=${project}`)
            .then(res => res.json())
            .then(users => {
                console.log("Loaded assignees:", users);  // ✅ Debug line
                const assigneeSelect = document.getElementById('assigneeFilter');
                assigneeSelect.innerHTML = '<option value="">-- Select --</option>';
                users.forEach(user => {
                    if (!user.displayName || !user.name) return;
    
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.text = user.displayName;
                    assigneeSelect.appendChild(option);
                });
            })
        : Promise.resolve();

    const teamPromise = fetch(`/api/teams?project=${project}`)
        .then(res => res.json())
        .then(teams => {
            const teamSelect = document.getElementById('teamFilter');
            teamSelect.innerHTML = '<option value="">-- All Teams --</option>';
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id;
                option.text = team.name;
                teamSelect.appendChild(option);
            });
        });

    Promise.all([epicPromise, assigneePromise, teamPromise]).then(() => {
        if (callback) callback();
    });
}





// When filters are applied, fetch issues and render the board
function applyFilters() {
    const project = document.getElementById("projectFilter").value;
    const epic = document.getElementById("epicFilter").value;
    const assignee = document.getElementById("assigneeFilter").value;
    const team = document.getElementById("teamFilter").value;

    const params = new URLSearchParams();
    if (project) params.append("project", project);
    if (epic) params.append("epic", epic);

    // Map display name -> username if known
    const assigneeUsername = assigneeNameToUsername?.[assignee] || assignee;
    if (assigneeUsername) params.append("assignee", assigneeUsername);


    if (team) params.append("team", team);

    fetch(`/api/issues?${params.toString()}`)
        .then(res => res.json())
        .then(data => renderBoard(data.issues))
        .catch(err => console.error("Failed to load issues:", err));

    // ✅ Close the popup
    document.getElementById("filterPopup").style.display = "none";
}


function getInitials(name) {
    if (!name) return "";
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function getAvatarColors(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hues = [30, 60, 90, 150, 180, 210, 240, 270, 300];
    const hue = hues[Math.abs(hash) % hues.length];

    const background = `hsl(${hue}, 70%, 85%)`; // light pastel
    const text = `hsl(${hue}, 70%, 30%)`;       // darker text version

    return { background, text };
}

function getContrastYIQ(hexcolor) {
    const rgb = hexcolor.match(/\d+/g).map(Number);
    const [r, g, b] = rgb.length === 3 ? rgb : [255, 255, 255];
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000' : '#fff';
}

function renderBoard(issues) {
    const sortMode = document.getElementById('sortMode')?.value || 'updated';

    // Sort issues globally before splitting into columns
    issues.sort((a, b) => {
        if (sortMode === 'assignee') {
            const aName = a.fields.assignee?.displayName || '';
            const bName = b.fields.assignee?.displayName || '';
            return aName.localeCompare(bName);
    
        } else if (sortMode === 'targetEnd') {
            const aDateRaw = a.fields.customfield_XXXXX;
            const bDateRaw = b.fields.customfield_XXXXX;
    
            const aDate = aDateRaw ? new Date(aDateRaw) : new Date(8640000000000000);  // "infinity"
            const bDate = bDateRaw ? new Date(bDateRaw) : new Date(8640000000000000);
    
            return aDate - bDate; // earliest first
    
        } else {
            const aTime = new Date(a.fields.updated);
            const bTime = new Date(b.fields.updated);
            return bTime - aTime;
        }
    });
    
    const columns = {
        "To Do": document.getElementById('todo'),
        "In Progress": document.getElementById('inprogress'),
        "In Review": document.getElementById('inreview'),
        "Blocked": document.getElementById('blocked')
    };

    // Clear columns
    for (const key in columns) {
        columns[key].innerHTML = `<h3>${key}</h3>`;
    }

    issues.forEach(issue => {
        // Determine the column based on the status of the issue
        const status = issue.fields.status.name; // Now using status name instead of statusCategory
        let columnId = "";  // Initialize as empty, no column selected

        // Map status names to column IDs
        if (status === "In Progress") {
            columnId = "In Progress";
        } else if (status === "In Review") {
            columnId = "In Review";
        } else if (status === "Blocked") {
            columnId = "Blocked";
        } else if (status === "To Do") {
            columnId = "To Do";
        }
        
        // If status is not recognized, skip rendering the card
        if (columnId === "") {
            return;  // Skip to the next iteration of the loop
        }
    
        const columnEl = columns[columnId];
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => window.open(`http://dart-jira01:8080/browse/${issue.key}`, '_blank');

        const contentDiv = document.createElement('div');
        contentDiv.className = 'card-content';
        
        // First line: key + summary
        const titleLine = document.createElement('div');
        titleLine.textContent = `${issue.key}: ${issue.fields.summary}`;
        contentDiv.appendChild(titleLine);
        contentDiv.title = contentDiv.textContent;

        // Add "Target End" line ONLY for In Progress column
        if (columnId === "In Progress") {
            const targetEnd = issue.fields.customfield_11302; // Replace with actual field ID
            const targetLine = document.createElement('div');
            targetLine.className = 'card-time';
            targetLine.style.marginTop = '2px';
            const now = new Date();
            let targetDateStr = '---';
            let targetDate = null;

            if (targetEnd) {
                targetDate = new Date(targetEnd);
                targetDateStr = targetDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }

            targetLine.textContent = `Target End: ${targetDateStr}`;

            if (!targetEnd) {
                targetLine.style.color = '#e69138'; // amber if missing
            } else if (targetDate < now) {
                targetLine.style.color = '#c00'; // red if overdue
            } else {
                targetLine.style.color = '#888'; // Default gray
            }

            contentDiv.appendChild(targetLine);
        }
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'card-meta';

        const timeDiv = document.createElement('div');
        timeDiv.className = 'card-time';
        timeDiv.textContent = timeSince(issue.fields.updated);

        // 🎨 Age-based color logic (exclude "Done" column)
        if (columnId !== "Done") {
            const updatedDate = new Date(issue.fields.updated);
            timeDiv.title = updatedDate.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const now = new Date();
            const ageInDays = (now - updatedDate) / (1000 * 60 * 60 * 24);

            if (ageInDays > 7) {
                timeDiv.style.color = '#c00'; // Red
            } else if (ageInDays > 3) {
                timeDiv.style.color = '#e69138'; // Amber
            } else {
                timeDiv.style.color = '#888'; // Default gray
            }
        } else {
            timeDiv.style.color = '#888'; // Always gray for Done
        }
        metaDiv.appendChild(timeDiv);

        const assignee = issue.fields.assignee;
        if (assignee) {
            const initials = getInitials(assignee.displayName);
            const { background, text } = getAvatarColors(assignee.displayName);

            const avatar = document.createElement('div');
            avatar.className = 'card-avatar';
            avatar.style.backgroundColor = background;
            avatar.style.color = text;
            avatar.style.border = `1px solid ${text}`;
            avatar.title = assignee.displayName;
            avatar.textContent = initials;

            metaDiv.appendChild(avatar);
        }

        card.appendChild(contentDiv);
        card.appendChild(metaDiv);
        columnEl.appendChild(card);
    });
}









// Close the filter popup when clicking outside or after clicking "Apply"
document.addEventListener("click", function (event) {
    const popup = document.getElementById("filterPopup");
    const filterBtn = document.getElementById("filterButton");

    if (!popup || !filterBtn) return;

    const clickedInsidePopup = popup.contains(event.target);
    const clickedFilterButton = filterBtn.contains(event.target);

    // Only hide if it's open AND we didn't click inside the popup or filter button
    if (popup.style.display === "block" &&
        !clickedInsidePopup &&
        !clickedFilterButton) {
        popup.style.display = "none";
    }
});

function timeSince(isoDateString) {
    const now = new Date();
    const updated = new Date(isoDateString);

    const seconds = Math.floor((now - updated) / 1000);
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks} wk${weeks !== 1 ? 's' : ''} ago`;

    // More accurate month and year calculation
    const years = now.getFullYear() - updated.getFullYear();
    const months = now.getMonth() - updated.getMonth() + (years * 12);  // Calculate months

    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;

    return `${years} year${years !== 1 ? 's' : ''} ago`;
}


