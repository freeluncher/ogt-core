require('dotenv').config();
const CloudConvert = require('cloudconvert');

if (!process.env.CLOUDCONVERT_API_KEY) {
    console.error("❌ CLOUDCONVERT_API_KEY is missing in .env");
    process.exit(1);
}

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY);

async function testConnection() {
    console.log("Testing CloudConvert connection...");
    try {
        const user = await cloudConvert.users.me();
        console.log("✅ API Key is valid!");
        console.log(`👤 Username: ${user.username}`);
        console.log(`💳 Credits remaining: ${user.credits} minutes`);
    } catch (error) {
        console.error("❌ Error connecting to CloudConvert:");
        console.error(error.message || error);
    }
}

testConnection();
