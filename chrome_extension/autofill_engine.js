// autofill_engine.js
class AutofillEngine {
  constructor(data) {
    this.data = data;
    this.mapper = new FieldMapper();
  }

  async fill() {
    const fields = PageScanner.scan();
    const mapping = this.mapper.map(fields, this.data);

    for (const [selector, value] of Object.entries(mapping)) {
      const element = document.querySelector(selector);
      if (element) {
        this.setValue(element, value);
      }
    }
    
    this.showSuccess();
  }

  setValue(element, value) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  showSuccess() {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 10000;
      background: #10b981; color: white; padding: 12px 24px;
      border-radius: 12px; font-family: sans-serif; font-weight: bold;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    `;
    toast.innerText = "SnapList AI: Autofill Complete!";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "autofill") {
    const engine = new AutofillEngine(request.data);
    engine.fill();
  }
});
