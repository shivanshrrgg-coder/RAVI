// popup.js
document.getElementById('syncBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.innerText = "Fetching latest listing...";
  
  try {
    // In a real extension, you'd use Firebase Auth here
    // For this demo, we'll simulate fetching the latest data
    // from a mock endpoint or storage
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: "autofill",
        data: {
          title: "Premium Wireless Headphones",
          description: "Experience crystal clear sound with our latest noise-cancelling technology.",
          price: "199.99",
          category: "Electronics"
        }
      });
      status.innerText = "Synced successfully!";
    });
  } catch (err) {
    status.innerText = "Error: " + err.message;
  }
});
