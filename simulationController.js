const mysql = require('mysql2/promise');
const config = require('./config');

async function createConnection(nodeKey) {
    return await mysql.createConnection(config[nodeKey]);
}

// Helper: Sleep function to simulate "processing time"
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const Simulation = {
    // --- SIMULATION CASE 1: Concurrent Reads (Node 2 & Node 3) ---
    // Scenario: User A reads ID 1 from Slave 1. User B reads ID 1 from Slave 1 (or Master).
    case1: async (isolationLevel) => {
        const logs = [];
        const log = (msg) => logs.push(`[${new Date().toISOString().split('T')[1]}] ${msg}`);
        
        log(`--- START CASE 1 (Isolation: ${isolationLevel}) ---`);

        const runRead = async (user, nodeName, id) => {
            let conn;
            try {
                conn = await createConnection(nodeName);
                log(`${user}: Connected to ${nodeName}`);
                
                await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
                await conn.beginTransaction();
                
                log(`${user}: Transaction Started. Reading ID ${id}...`);
                const [rows] = await conn.query('SELECT * FROM Users WHERE id = ?', [id]);
                
                log(`${user}: Read Data -> ${JSON.stringify(rows[0] || 'Not Found')}`);
                await sleep(2000); // Simulate reading time
                
                await conn.commit();
                log(`${user}: Committed.`);
            } catch (err) {
                log(`${user}: ERROR - ${err.message}`);
                if (conn) await conn.rollback();
            } finally {
                if (conn) await conn.end();
            }
        };

        await Promise.all([
            runRead('User A', 'node1', 1),
            runRead('User B', 'node2', 1)  
        ]);

        return logs;
    },

    // --- SIMULATION CASE 2: Write vs Read ---
    // Scenario: User A Updates ID 1. User B tries to Read ID 1 before User A finishes.
    case2: async (isolationLevel) => {
        const logs = [];
        const log = (msg) => logs.push(`[${new Date().toISOString().split('T')[1]}] ${msg}`);
        
        log(`--- START CASE 2 (Isolation: ${isolationLevel}) ---`);
        const targetId = 1;

        const runWriter = async () => {
            let conn;
            try {
                conn = await createConnection('node1');
                await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
                await conn.beginTransaction();
                
                log(`WRITER: Updating ID ${targetId} (setting country = 'LOCKED')...`);
                await conn.query('UPDATE Users SET country = ? WHERE id = ?', ['LOCKED', targetId]);
                
                log(`WRITER: Update sent. Sleeping 5 seconds to hold lock...`);
                await sleep(5000); 
                
                await conn.commit();
                log(`WRITER: Committed. Lock released.`);
            } catch (err) {
                log(`WRITER: Error - ${err.message}`);
                if(conn) await conn.rollback();
            } finally { if(conn) await conn.end(); }
        };

        const runReader = async () => {
            await sleep(1000);
            let conn;
            try {
                conn = await createConnection('node1'); 
                await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
                await conn.beginTransaction();
                
                log(`READER: Trying to read ID ${targetId}...`);
                const [rows] = await conn.query('SELECT * FROM Users WHERE id = ?', [targetId]);
                
                log(`READER: Success! Saw Data: ${rows[0]?.country}`);
                await conn.commit();
            } catch (err) {
                log(`READER: Error - ${err.message}`);
            } finally { if(conn) await conn.end(); }
        };

        await Promise.all([runWriter(), runReader()]);
        return logs;
    },

    // --- SIMULATION CASE 3: Write vs Write ---
    // Scenario: User A updates ID 1. User B tries to update ID 1 at the same time.
    case3: async (isolationLevel) => {
        const logs = [];
        const log = (msg) => logs.push(`[${new Date().toISOString().split('T')[1]}] ${msg}`);
        
        log(`--- START CASE 3 (Isolation: ${isolationLevel}) ---`);
        const targetId = 1;

        const runUpdate = async (user, delay) => {
            await sleep(delay); 
            let conn;
            try {
                conn = await createConnection('node1');
                await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
                await conn.beginTransaction();
                
                log(`${user}: Attempting Update on ID ${targetId}...`);
                await conn.query('UPDATE Users SET username = ? WHERE id = ?', [`User_${user}`, targetId]);
                
                log(`${user}: Update success! Holding lock for 3s...`);
                await sleep(3000);
                
                await conn.commit();
                log(`${user}: Committed.`);
            } catch (err) {
                log(`${user}: ERROR/BLOCKED - ${err.message}`);
                if(conn) await conn.rollback();
            } finally { if(conn) await conn.end(); }
        };

        await Promise.all([
            runUpdate('User A', 0),
            runUpdate('User B', 500)
        ]);
        
        return logs;
    }
};

module.exports = Simulation;