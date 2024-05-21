const WebSocket = require('ws');
const generateSTL = require('./generateSTL');
const path = require('path');
const fetch = require('node-fetch');

async function processOrder(orderID, items) {
    try {
        for (const item of items) {
            for (const image of item.images) {
                // Constructing an absolute URL for the image
                const imageUrl = `https://lithophane-generator-76e9a8bbe995.herokuapp.com/finalized-uploads/${image}`;
                const outputDir = path.join(__dirname, 'stl-outputs', `order_${orderID}`, `item_${item.itemID}`);
                await generateSTL(imageUrl, item.hasHangars, outputDir);
            }
        }
        console.log(`Order ${orderID} processed successfully`);
    } catch (error) {
        console.error(`Error processing order ${orderID}:`, error);
    }
}

function createWebSocket() {
    const ws = new WebSocket('wss://lithophane-generator-76e9a8bbe995.herokuapp.com/');

    ws.on('open', () => {
        console.log('Connected to server');
        startPing(ws);
    });

    ws.on('message', (data) => {
        console.log('Received message:', data);
        const message = JSON.parse(data);
        if (message.event === 'generateSTL') {
            processOrder(message.orderID, message.items);
        }
    });

    ws.on('close', () => {
        console.log('Disconnected from server');
        setTimeout(createWebSocket, 1000); // Reconnect after 1 second
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        setTimeout(createWebSocket, 1000); // Reconnect after 1 second
    });

    return ws;
}

function startPing(socket) {
    const pingInterval = 30000; // 30 seconds
    let pingTimeout;

    function ping() {
        clearTimeout(pingTimeout);
        if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
            pingTimeout = setTimeout(() => {
                socket.terminate(); // Terminate if no pong is received
            }, pingInterval);
        }
    }

    socket.on('pong', () => {
        clearTimeout(pingTimeout); // Clear the timeout on pong
    });

    setInterval(ping, pingInterval);
}

// Initial WebSocket connection
createWebSocket();






