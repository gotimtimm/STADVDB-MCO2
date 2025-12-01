const express = require('express');
const path = require('path');
const userService = require('./userService'); 

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const getIsoLevel = (req) => req.query.iso || 'READ UNCOMMITTED';

app.get('/api/users/:id', async (req, res) => {
    console.log(`[GET] Request for ID: ${req.params.id} | Level: ${getIsoLevel(req)}`);
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
    console.log(`[POST] Creating User: ${req.body.id} | Level: ${getIsoLevel(req)}`);
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
    console.log(`[PUT] Updating ID: ${req.params.id} | Level: ${getIsoLevel(req)}`);
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
    console.log(`[DELETE] ID: ${req.params.id} | Level: ${getIsoLevel(req)}`);
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


app.post('/api/recovery', async (req, res) => {
    console.log(`[RECOVERY] Request received for: ${req.body.node}`);
    try {
        const { node } = req.body;
        // Call the new function we just added to userService
        const result = await userService.recoverNode(node);
        res.json({ 
            status: 'Recovery Complete', 
            details: result 
        });
    } catch (err) {
        console.error("[RECOVERY] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});