const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'failed_transactions.json');

function getLogs() {
    if (!fs.existsSync(LOG_FILE)) return [];
    const data = fs.readFileSync(LOG_FILE);
    return JSON.parse(data);
}

// 1. LOGGING (When a node fails)
function logFailedTransaction(nodeName, query, params) {
    const logs = getLogs();
    
    const entry = {
        node: nodeName,
        query: query,
        params: params,
        timestamp: new Date().toISOString()
    };

    logs.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    console.log(`[RECOVERY] 📝 Transaction logged for ${nodeName} to replay later.`);
}

// 2. REPLAY (When a node comes back online)
async function replayLogs(nodeName, pool) {
    console.log(`[RECOVERY] 🔄 Checking for missed transactions for ${nodeName}...`);
    const logs = getLogs();
    const nodeLogs = logs.filter(log => log.node === nodeName);
    
    if (nodeLogs.length === 0) {
        console.log(`[RECOVERY] No pending logs for ${nodeName}.`);
        return;
    }

    console.log(`[RECOVERY] Found ${nodeLogs.length} missed transactions. Replaying now...`);

    for (const log of nodeLogs) {
        try {
            await pool.execute(log.query, log.params);
            console.log(`   Replayed: ${log.query}`);
        } catch (err) {
            console.error(`   Failed to replay: ${err.message}`);
        }
    }

    const remainingLogs = logs.filter(log => log.node !== nodeName);
    fs.writeFileSync(LOG_FILE, JSON.stringify(remainingLogs, null, 2));
    console.log(`[RECOVERY] Sync complete for ${nodeName}.`);
}

module.exports = { logFailedTransaction, replayLogs };