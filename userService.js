const mysql = require('mysql2/promise');
const config = require('./config');

// partitions may be subject to change based on sharding strategy
const poolMaster = mysql.createPool(config.node1);
const poolSlave1 = mysql.createPool(config.node2); // odd ids
const poolSlave2 = mysql.createPool(config.node3); // even ids

const getTargetSlavePool = (id) => (id % 2 !== 0 ? poolSlave1 : poolSlave2);

async function executeDistributedWrite(id, query, params, isolationLevel = 'READ UNCOMMITTED') {
    let connMaster = null;
    let connSlave = null;
    
    const slavePool = getTargetSlavePool(id);

    try {
        connMaster = await poolMaster.getConnection();
        connSlave = await slavePool.getConnection();

        await Promise.all([
            connMaster.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel}`),
            connSlave.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel}`)
        ]);

        await Promise.all([
            connMaster.beginTransaction(),
            connSlave.beginTransaction()
        ]);

        await connMaster.execute(query, params);
        await connSlave.execute(query, params);

        await Promise.all([
            connMaster.commit(),
            connSlave.commit()
        ]);

        return { success: true, message: "Distributed transaction committed successfully." };

    } catch (err) {
        console.error("Transaction failed. Rolling back on all nodes...", err.message);
        if (connMaster) await connMaster.rollback();
        if (connSlave) await connSlave.rollback();
        throw err;
    } finally {
        if (connMaster) connMaster.release();
        if (connSlave) connSlave.release();
    }
}

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

module.exports = {
    createUser: async (id, username, country, iso) => {
        const query = 'INSERT INTO user_profiles (id, username, country) VALUES (?, ?, ?)';
        return await executeDistributedWrite(id, query, [id, username, country], iso);
    },
    updateUser: async (id, country, iso) => {
        const query = 'UPDATE user_profiles SET country = ? WHERE id = ?';
        return await executeDistributedWrite(id, query, [country, id], iso);
    },
    deleteUser: async (id, iso) => {
        const query = 'DELETE FROM user_profiles WHERE id = ?';
        return await executeDistributedWrite(id, query, [id], iso);
    },
    getUser: executeRead
};