const mysql = require('mysql2/promise');
const config = require('./config');
const { logFailedTransaction, replayLogs } = require('./recoveryLog');

// 1. DATABASE POOL SETUP
// Create connection pools for all three nodes based on config
const poolMaster = mysql.createPool(config.node1);
const poolSlave1 = mysql.createPool(config.node2); // Holds Odd IDs
const poolSlave2 = mysql.createPool(config.node3); // Holds Even IDs

// Helper: Determine which slave node handles a specific ID (Odd vs Even)
const getTargetSlavePool = (id) => (id % 2 !== 0 ? poolSlave1 : poolSlave2);

// 2. ROBUST WRITE FUNCTION (Handles Failures)
async function executeDistributedWrite(id, query, params, isolationLevel = 'READ UNCOMMITTED') {
    let connMaster = null;
    let connSlave = null;
    let masterSuccess = false;
    let slaveSuccess = false;
    
    // Identify which slave node we are targeting
    const slavePool = getTargetSlavePool(id);
    // Explicitly name the node for logging purposes
    const slaveName = (slavePool === poolSlave1) ? 'node2' : 'node3';

    // --- STEP A: ATTEMPT WRITE TO MASTER (Node 1) ---
    try {
        console.log(`[WRITE] Attempting Master write...`);
        connMaster = await poolMaster.getConnection();
        await connMaster.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        await connMaster.beginTransaction();
        
        await connMaster.execute(query, params);
        
        await connMaster.commit();
        masterSuccess = true;
        console.log("✅ Master Write Success");

    } catch (err) {
        console.error("❌ Master Failed:", err.message);
        if (connMaster) await connMaster.rollback();
        
        // Log failure for recovery later (Case #1 & #2)
        console.log("⚠️ Logging failure for Node 1...");
        logFailedTransaction('node1', query, params);
    } finally {
        if (connMaster) connMaster.release();
    }

    // --- STEP B: ATTEMPT WRITE TO SLAVE (Node 2 or 3) ---
    try {
        console.log(`[WRITE] Attempting Slave (${slaveName}) write...`);
        connSlave = await slavePool.getConnection();
        await connSlave.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        await connSlave.beginTransaction();
        
        await connSlave.execute(query, params);
        
        await connSlave.commit();
        slaveSuccess = true;
        console.log(`✅ Slave (${slaveName}) Write Success`);

    } catch (err) {
        console.error(`❌ Slave (${slaveName}) Failed:`, err.message);
        if (connSlave) await connSlave.rollback();

        // Log failure for recovery later (Case #3 & #4)
        console.log(`⚠️ Logging failure for ${slaveName}...`);
        logFailedTransaction(slaveName, query, params);
    } finally {
        if (connSlave) connSlave.release();
    }

    // --- STEP C: DETERMINE FINAL STATUS ---
    // If at least one node succeeded, we consider the transaction "committed" 
    // (High Availability approach). If both failed, the system is down.
    if (masterSuccess || slaveSuccess) {
        return { 
            success: true, 
            message: "Transaction processed. (Check server logs for partial failures)" 
        };
    } else {
        throw new Error("Cluster completely unavailable. Write failed on all nodes.");
    }
}

// 3. READ FUNCTION
async function executeRead(id, isolationLevel = 'READ UNCOMMITTED') {
    let connSlave = null;
    const slavePool = getTargetSlavePool(id);

    try {
        connSlave = await slavePool.getConnection();
        await connSlave.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        await connSlave.beginTransaction();
        
        const [rows] = await connSlave.execute('SELECT * FROM user_profiles WHERE id = ?', [id]);
        
        await connSlave.commit();
        return rows[0];

    } catch (err) {
        if (connSlave) await connSlave.rollback();
        throw err;
    } finally {
        if (connSlave) connSlave.release();
    }
}

// 4. MODULE EXPORTS
module.exports = {
    // Standard CRUD Operations
    createUser: async (id, username, country, iso) => {
            const query = 'INSERT INTO user_profiles (id, username, country, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())';
            return await executeDistributedWrite(id, query, [id, username, country], iso);
        },

    updateUser: async (id, country, iso) => {
        const query = 'UPDATE user_profiles SET country = ?, updatedAt = NOW() WHERE id = ?';
        return await executeDistributedWrite(id, query, [country, id], iso);
    },
    deleteUser: async (id, iso) => {
        const query = 'DELETE FROM user_profiles WHERE id = ?';
        return await executeDistributedWrite(id, query, [id], iso);
    },
    getUser: executeRead,

    recoverNode: async (nodeName) => {
        let pool;
        if (nodeName === 'node1') pool = poolMaster;
        else if (nodeName === 'node2') pool = poolSlave1;
        else if (nodeName === 'node3') pool = poolSlave2;
        
        if (pool) {
            // Trigger the replay logic from recoveryLog.js
            await replayLogs(nodeName, pool);
            return { message: `Recovery process finished for ${nodeName}` };
        }
        throw new Error("Invalid node name provided for recovery.");
    }
};