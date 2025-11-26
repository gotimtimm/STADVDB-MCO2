const mysql = require('mysql2/promise');
const config = require('./config');
const recovery = require('./recovery');

// --- CONNECTION POOLS ---
const poolMaster = mysql.createPool(config.node1);
const poolSlave1 = mysql.createPool(config.node2);
const poolSlave2 = mysql.createPool(config.node3);

const pools = {
    master: poolMaster,
    slave1: poolSlave1,
    slave2: poolSlave2
};

// Fragmentation is just odd or even IDs
function getTargetSlave(id) {
    if (id % 2 !== 0) {
        return 'slave1'; 
    } else {
        return 'slave2';
    }
}

// 2. MASTER-SLAVE INSERT (Replication)
async function insertUser(user) {
    const { id, username, country } = user;
    const targetSlaveName = getTargetSlave(id);
    
    const query = 'INSERT INTO user_profiles (id, username, country) VALUES (?, ?, ?)';
    const params = [id, username, country];

    let masterSuccess = false;
    let slaveSuccess = false;

    try {
        await pools.master.execute(query, params);
        masterSuccess = true;
        console.log("Written to Master.");
    } catch (err) {
        console.error("Master Write Failed:", err.message);
        recovery.logFailedTransaction('node1', query, params);
    }

    try {
        await pools[targetSlaveName].execute(query, params);
        slaveSuccess = true;
        console.log(`Written to ${targetSlaveName}.`);
    } catch (err) {
        console.error(`Slave (${targetSlaveName}) Write Failed:`, err.message);
        recovery.logFailedTransaction(config[targetSlaveName].host, query, params); 
    }

    return { master: masterSuccess, slave: slaveSuccess };
}

// 3. MASTER-SLAVE READ (Routing)
async function getUser(id) {
    const targetSlaveName = getTargetSlave(id);
    console.log(`\n[QUERY] Requesting User ID: ${id}`);

    try {
        console.log(`[ROUTER] Routing read to ${targetSlaveName}...`);
        const [rows] = await pools[targetSlaveName].execute('SELECT * FROM user_profiles WHERE id = ?', [id]);
        
        if (rows.length > 0) {
            console.log("Found in Slave.");
            return rows[0];
        } else {
            console.log("Not found in Slave. Checking Master...");
            throw new Error("Data missing in Slave");
        }

    } catch (error) {
        console.warn(`[RECOVERY] Slave unreachable or inconsistent. Failing over to Central Master.`);
        const [rows] = await pools.master.execute('SELECT * FROM user_profiles WHERE id = ?', [id]);
        return rows[0];
    }
}

async function recoverNode(nodeName) {
    const targetPool = pools[nodeName === 'node1' ? 'master' : (nodeName === 'node2' ? 'slave1' : 'slave2')];
    
    if (targetPool) {
        await recovery.replayLogs(nodeName, targetPool);
        return "Recovery Process Triggered";
    } else {
        return "Invalid Node Name";
    }
}

module.exports = { insertUser, getUser, pools };