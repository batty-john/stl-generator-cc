const WebSocket = require('ws');
const generateSTL = require('./generateSTL');
const path = require('path');

async function processOrder(orderID, items) {
    try {
        console.log('Order ID:', orderID);
        console.log('Items:', items);

        for (const item of items) {
            if (!Array.isArray(item.images)) {
                throw new Error('Invalid item data: images is not an array');
            }

            const aspectRatio = item.aspectRatio; // Use the aspect ratio passed from notifySTLGeneration
            console.log('Aspect ratio:', aspectRatio);

            for (const [index, image] of item.images.entries()) {
                console.log('Processing image:', image);

                // Constructing an absolute URL for the image
                const imageUrl = `https://lithophane-generator-76e9a8bbe995.herokuapp.com/finalized-uploads/${image}`;
                const outputDir = path.join(__dirname, 'stl-outputs', `order_${orderID}`, `item_${item.itemID}`);
                const outputFileName = `order_${orderID}_item_${item.itemID}_image_${index + 1}`;
                await generateSTL(imageUrl, item.hanger, outputDir, outputFileName, aspectRatio);
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
            console.log('Processing message:', message);
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








