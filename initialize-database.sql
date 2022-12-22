CREATE TABLE streams (
    id VARCHAR(500) NOT NULL PRIMARY KEY,
    peerCount INTEGER NOT NULL,
    messagesPerSecond DECIMAL(8,2) NOT NULL,
    publisherCount INTEGER,  -- NULL if stream has public publish permission
    subscriberCount INTEGER  -- NULL if stream has public subscribe permission
);

CREATE INDEX streams_peerCount on streams (peerCount);

CREATE INDEX streams_messagesPerSecond on streams (messagesPerSecond);

CREATE INDEX streams_publisherCount on streams (publisherCount);

CREATE INDEX streams_subscriberCount on streams (subscriberCount);
