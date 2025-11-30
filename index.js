const express = require('express');
const userService = require('./userService');
const app = express();

app.use(express.json());

const getIsoLevel = (req) => req.query.iso || 'READ UNCOMMITTED';

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Distributed Transaction Manager</title>
            <style>
                body { font-family: sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                .card { border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; background: #f9f9f9; }
                button { cursor: pointer; padding: 8px 12px; background: #007bff; color: white; border: none; border-radius: 4px; }
                button:hover { background: #0056b3; }
                select { padding: 8px; margin-right: 10px; }
                pre { background: #333; color: #fff; padding: 10px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <h1>Distributed Database Manager</h1>
            
            <div class="card">
                <label><b>Isolation Level:</b></label>
                <select id="iso">
                    <option value="READ UNCOMMITTED">READ UNCOMMITTED</option>
                    <option value="READ COMMITTED">READ COMMITTED</option>
                    <option value="REPEATABLE READ">REPEATABLE READ</option>
                    <option value="SERIALIZABLE">SERIALIZABLE</option>
                </select>
            </div>

            <div class="card">
                <h3>1. Read User (ID: 1)</h3>
                <button onclick="readUser()">Read Data</button>
            </div>

            <div class="card">
                <h3>2. Create User</h3>
                <input type="number" id="createId" placeholder="ID (e.g. 101)" style="padding: 5px; width: 80px;">
                <input type="text" id="createName" placeholder="Name" style="padding: 5px;">
                <input type="text" id="createCountry" placeholder="Country" style="padding: 5px;">
                <button onclick="createUser()">Create</button>
            </div>

            <div class="card">
                <h3>3. Update Country (ID: 1)</h3>
                <input type="text" id="updateCountry" placeholder="New Country" value="Philippines" style="padding: 5px;">
                <button onclick="updateUser()">Update</button>
            </div>

            <div class="card">
                <h3>4. Delete User</h3>
                <input type="number" id="deleteId" placeholder="ID to Delete" style="padding: 5px; width: 80px;">
                <button onclick="deleteUser()">Delete</button>
            </div>

            <h3>Result Log:</h3>
            <pre id="log">Waiting for action...</pre>

            <script>
                const log = (msg) => document.getElementById('log').textContent = JSON.stringify(msg, null, 2);
                const getIso = () => encodeURIComponent(document.getElementById('iso').value); // FIXED: Encodes spaces

                async function readUser() {
                    const iso = getIso();
                    log("Reading...");
                    try {
                        const res = await fetch('/api/users/1?iso=' + iso);
                        const data = await res.json();
                        log(data);
                    } catch(e) { log("Error: " + e.message); }
                }

                async function createUser() {
                    const id = document.getElementById('createId').value;
                    const username = document.getElementById('createName').value;
                    const country = document.getElementById('createCountry').value;
                    const iso = getIso();
                    
                    try {
                        const res = await fetch('/api/users?iso=' + iso, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id, username, country })
                        });
                        const data = await res.json();
                        log(data);
                    } catch(e) { log("Error: " + e.message); }
                }

                async function updateUser() {
                    const country = document.getElementById('updateCountry').value;
                    const iso = getIso();
                    
                    try {
                        const res = await fetch('/api/users/1?iso=' + iso, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ country })
                        });
                        const data = await res.json();
                        log(data);
                    } catch(e) { log("Error: " + e.message); }
                }

                async function deleteUser() {
                    const id = document.getElementById('deleteId').value;
                    const iso = getIso();
                    
                    try {
                        const res = await fetch('/api/users/' + id + '?iso=' + iso, {
                            method: 'DELETE'
                        });
                        const data = await res.json();
                        log(data);
                    } catch(e) { log("Error: " + e.message); }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/api/users/:id', async (req, res) => {
    console.log(`[GET] Request for ID: ${req.params.id}`);
    try {
        const user = await userService.getUser(req.params.id, getIsoLevel(req));
        if (!user) return res.status(404).json({ error: 'User not found in Slave Node' });
        res.json({ 
            status: 'Success', 
            isolation_used: getIsoLevel(req),
            data: user 
        });
    } catch (err) {
        console.error("[GET] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    console.log(`[POST] Creating User: ${req.body.id}`);
    try {
        const { id, username, country } = req.body;
        if(!id || !username || !country) return res.status(400).json({error: "Missing fields"});
        
        const result = await userService.createUser(id, username, country, getIsoLevel(req));
        res.status(201).json({
            status: 'Committed to Master & Slave',
            isolation_used: getIsoLevel(req),
            result: result
        });
    } catch (err) {
        console.error("[POST] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    console.log(`[PUT] Updating ID: ${req.params.id}`);
    try {
        const { country } = req.body;
        const result = await userService.updateUser(req.params.id, country, getIsoLevel(req));
        res.json({
            status: 'Updated Master & Slave',
            isolation_used: getIsoLevel(req),
            result: result
        });
    } catch (err) {
        console.error("[PUT] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    console.log(`[DELETE] ID: ${req.params.id}`);
    try {
        const result = await userService.deleteUser(req.params.id, getIsoLevel(req));
        res.json({
            status: 'Deleted from Master & Slave',
            isolation_used: getIsoLevel(req),
            result: result
        });
    } catch (err) {
        console.error("[DELETE] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});