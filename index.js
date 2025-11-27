const express = require('express');
const dbRouter = require('./dbRouter');
const simulation = require('./simulationController');

const app = express();
app.use(express.json());

// 1. Route to Read Data 
app.get('/user/:id', async (req, res) => {
    try {
        const user = await dbRouter.getUser(req.params.id);
        res.json(user);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// 2. Route to Write Data
app.post('/add-user', async (req, res) => {
    try {
        const result = await dbRouter.insertUser(req.body);
        res.json({ success: true, status: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to run simulation and display logs neatly
const runSim = async (res, caseFn, isoLevel) => {
    try {
        const logs = await caseFn(isoLevel);
        res.send(`
            <h2>Simulation Results</h2>
            <p><b>Case:</b> ${caseFn.name} | <b>Isolation:</b> ${isoLevel}</p>
            <pre style="background: #f4f4f4; padding: 10px; border: 1px solid #ddd;">${logs.join('\n')}</pre>
            <br><a href="/">Back</a>
        `);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

// Routes for the Simulations
app.get('/simulate/case1', (req, res) => runSim(res, simulation.case1, req.query.iso || 'READ UNCOMMITTED'));
app.get('/simulate/case2', (req, res) => runSim(res, simulation.case2, req.query.iso || 'READ UNCOMMITTED'));
app.get('/simulate/case3', (req, res) => runSim(res, simulation.case3, req.query.iso || 'READ UNCOMMITTED'));

app.get('/', (req, res) => {
    res.send(`
        <h1>Distributed DB Simulation</h1>
        <h3>Select Isolation Level:</h3>
        <select id="iso">
            <option value="READ UNCOMMITTED">READ UNCOMMITTED</option>
            <option value="READ COMMITTED">READ COMMITTED</option>
            <option value="REPEATABLE READ">REPEATABLE READ</option>
            <option value="SERIALIZABLE">SERIALIZABLE</option>
        </select>
        <hr>
        <button onclick="run('case1')">Run Case 1 (Read-Read)</button>
        <button onclick="run('case2')">Run Case 2 (Write-Read)</button>
        <button onclick="run('case3')">Run Case 3 (Write-Write)</button>

        <script>
            function run(caseName) {
                const iso = document.getElementById('iso').value;
                window.location.href = '/simulate/' + caseName + '?iso=' + iso;
            }
        </script>
    `);
});

// Start the Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});