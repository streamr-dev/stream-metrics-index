CREATE TABLE IF NOT EXISTS streams (
    id VARCHAR(500) NOT NULL PRIMARY KEY,
    description TEXT,
    peerCount INTEGER NOT NULL,
    messagesPerSecond DECIMAL(8,2) NOT NULL,
    bytesPerSecond DECIMAL(16,2) NOT NULL,
    publisherCount INTEGER,  -- NULL if stream has public publish permission
    subscriberCount INTEGER,  -- NULL if stream has public subscribe permission
    crawlTimestamp DATETIME NOT NULL,
    INDEX streams_peerCount (peerCount),
    INDEX streams_description (description(100)),
    INDEX streams_messagesPerSecond (messagesPerSecond),
    INDEX streams_bytesPerSecond (bytesPerSecond),
    INDEX streams_publisherCount (publisherCount),
    INDEX streams_subscriberCount (subscriberCount)
);

CREATE TABLE IF NOT EXISTS nodes (
    id CHAR(40) NOT NULL PRIMARY KEY,
    ipAddress VARCHAR(15)
);

CREATE TABLE IF NOT EXISTS neighbors (
    streamPartId VARCHAR(500) NOT NULL,
    nodeId1 CHAR(40) NOT NULL,
    nodeId2 CHAR(40) NOT NULL,
    PRIMARY KEY (streamPartId, nodeId1, nodeId2),
    FOREIGN KEY (nodeId1) REFERENCES nodes(id),
    FOREIGN KEY (nodeId2) REFERENCES nodes(id),
    INDEX neighbors_streamPartId (streamPartId)
);
