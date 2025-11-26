const dbConfig = {
    node1: {
        host: '10.2.14.138',
        user: 'root',
        password: 'PASSWORD', // Update this later
        database: 'source_db',
        waitForConnections: true,
        connectionLimit: 10,
        port: 3306 
    },
    node2: { 
        host: '10.2.14.139',
        user: 'root',
        password: 'PASSWORD',
        database: 'source_db',
        waitForConnections: true,
        connectionLimit: 10,
        port: 3306
    },
    node3: {
        host: '10.2.14.140',
        user: 'root',
        password: 'PASSWORD',
        database: 'source_db',
        waitForConnections: true,
        connectionLimit: 10,
        port: 3306
    }
};

module.exports = dbConfig;