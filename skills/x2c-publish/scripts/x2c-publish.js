#!/usr/bin/env node

/**
 * X2C Publish - Video Publishing & Asset Management
 * 
 * Usage:
 *   node scripts/x2c-publish.js <command> [options]
 * 
 * Commands:
 *   categories              - List available categories
 *   upload-url              - Get S3 upload URLs
 *   publish <title> <desc>  - Publish video project
 *   query <project_id>      - Check project status
 *   add-episodes            - Add episodes to project
 *   list                    - List all projects
 *   balance                 - Check wallet balance
 *   claim-x2c <amount>     - Claim X2C to wallet
 *   swap-x2c <amount>      - Swap X2C to USDC
 *   withdraw <amount> <addr> - Withdraw USDC
 *   transactions            - View transaction history
 */

const API_BASE = 'https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api';
const fs = require('fs');
const path = require('path');

// Get API key from credentials
function getApiKey() {
  const userId = process.env.USER_ID || process.env.TELEGRAM_USER_ID;
  
  // Check workspace credentials first, then skill credentials
  const workspaceCredPath = path.join(__dirname, '../../../credentials', `${userId}.json`);
  const skillCredPath = path.join(__dirname, '../credentials', `${userId}.json`);
  
  let credPath = null;
  if (fs.existsSync(workspaceCredPath)) {
    credPath = workspaceCredPath;
  } else if (fs.existsSync(skillCredPath)) {
    credPath = skillCredPath;
  }
  
  if (!credPath) {
    throw new Error(`Credentials not found for user: ${userId}`);
  }
  
  const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  if (!cred.x2cApiKey) {
    throw new Error(`x2cApiKey not found in credentials for user: ${userId}`);
  }
  
  return cred.x2cApiKey;
}

// Make API request
async function apiRequest(action, params = {}) {
  const apiKey = getApiKey();
  
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({ action, ...params })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error: ${JSON.stringify(data)}`);
  }
  
  return data;
}

// Upload file to S3
async function uploadToS3(uploadUrl, filePath, contentType) {
  const fileBuffer = fs.readFileSync(filePath);
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Host': 's3api.arkfs.co',
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
    },
    body: fileBuffer
  });
  
  if (!response.ok) {
    throw new Error(`S3 Upload failed: ${response.status}`);
  }
  
  return true;
}

// Commands
const commands = {
  // Distribution API
  async categories(args) {
    const lang = args[0] || 'zh-CN';
    const result = await apiRequest('distribution/categories', { lang });
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async 'upload-url'(args) {
    const files = args[0] ? JSON.parse(args[0]) : [
      { file_type: 'cover', file_name: 'cover.jpg', content_type: 'image/jpeg' },
      { file_type: 'video', file_name: 'ep1.mp4', content_type: 'video/mp4' }
    ];
    const result = await apiRequest('distribution/upload-url', { files });
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async publish(args) {
    // Usage: publish "title" "description" category_id cover_url video_urls...
    const [title, description, categoryId, coverUrl, ...videoUrls] = args;
    
    if (!title || !description || !categoryId || !coverUrl || videoUrls.length === 0) {
      console.error('Usage: publish <title> <description> <category_id> <cover_url> <video_url> [video_url2...]');
      process.exit(1);
    }
    
    const result = await apiRequest('distribution/publish', {
      title,
      description,
      category_id: categoryId,
      cover_url: coverUrl,
      video_urls: videoUrls,
      enable_prediction: false
    });
    
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async query(args) {
    const projectId = args[0];
    if (!projectId) {
      console.error('Usage: query <project_id>');
      process.exit(1);
    }
    
    const result = await apiRequest('distribution/query', { project_id: projectId });
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async 'add-episodes'(args) {
    const [projectId, ...videoUrls] = args;
    if (!projectId || videoUrls.length === 0) {
      console.error('Usage: add-episodes <project_id> <video_url> [video_url2...]');
      process.exit(1);
    }
    
    const result = await apiRequest('distribution/add-episodes', {
      project_id: projectId,
      video_urls: videoUrls
    });
    
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async list(args) {
    const page = parseInt(args[0]) || 1;
    const pageSize = parseInt(args[1]) || 20;
    const status = args[2] || 'approved';
    
    const result = await apiRequest('distribution/list', {
      page,
      page_size: pageSize,
      status
    });
    
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  // Wallet API
  async balance(args) {
    const result = await apiRequest('wallet/balance');
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async 'claim-x2c'(args) {
    const amount = parseFloat(args[0]);
    if (!amount || amount <= 0) {
      console.error('Usage: claim-x2c <amount>');
      process.exit(1);
    }
    
    const result = await apiRequest('wallet/claim-x2c', { amount });
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async 'swap-x2c'(args) {
    const amount = parseFloat(args[0]);
    if (!amount || amount <= 0) {
      console.error('Usage: swap-x2c <amount>');
      process.exit(1);
    }
    
    const result = await apiRequest('wallet/swap-x2c', { amount });
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async withdraw(args) {
    const [amount, toAddress] = args;
    if (!amount || !toAddress) {
      console.error('Usage: withdraw <amount> <to_address>');
      process.exit(1);
    }
    
    const result = await apiRequest('wallet/withdraw-usdc', {
      amount: parseFloat(amount),
      to_address: toAddress
    });
    
    console.log(JSON.stringify(result, null, 2));
    return result;
  },
  
  async transactions(args) {
    const page = parseInt(args[0]) || 1;
    const pageSize = parseInt(args[1]) || 20;
    const type = args[2] || 'all';
    
    const result = await apiRequest('wallet/transactions', {
      page,
      page_size: pageSize,
      type
    });
    
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
};

// Main
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  if (!command || command === '--help' || command === '-h') {
    console.log(`
X2C Publish - Video Publishing & Asset Management

Usage: node x2c-publish.js <command> [options]

Distribution Commands:
  categories [lang]                    - List available categories
  upload-url [files_json]              - Get S3 upload URLs
  publish <title> <desc> <cat> <cover> <vid>... - Publish project
  query <project_id>                   - Check project status
  add-episodes <project_id> <vid>...   - Add episodes
  list [page] [page_size] [status]    - List projects

Wallet Commands:
  balance                              - Check wallet balance
  claim-x2c <amount>                   - Claim X2C to wallet
  swap-x2c <amount>                    - Swap X2C to USDC
  withdraw <amount> <address>          - Withdraw USDC
  transactions [page] [size] [type]   - View transaction history

Environment:
  USER_ID or TELEGRAM_USER_ID         - User identifier for credentials

Examples:
  node x2c-publish.js balance
  node x2c-publish.js publish "My Drama" "A story..." cat_id https://.../cover.jpg https://.../video.mp4
  node x2c-publish.js query project_uuid
`);
    process.exit(0);
  }
  
  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    console.error('Run with --help for usage');
    process.exit(1);
  }
  
  try {
    await commands[command](args);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
