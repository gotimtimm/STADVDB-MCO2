const dbConfig = {
    node1: {
        host: 'ccscloud.dlsu.edu.ph',
        user: 'student',
        password: 'password',
        database: 'users_db',
        waitForConnections: true,
        connectionLimit: 10,
        port: 60838 
    },
    node2: { 
        host: 'ccscloud.dlsu.edu.ph',
        user: 'student',
        password: 'password',
        database: 'users_db',
        waitForConnections: true,
        connectionLimit: 10,
        port: 60839
    },
    node3: {
        host: 'ccscloud.dlsu.edu.ph',
        user: 'student2',
        password: 'password',
        database: 'users_db',
        waitForConnections: true,
        connectionLimit: 10,
        port: 60840
    }
};

module.exports = dbConfig;