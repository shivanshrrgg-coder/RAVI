// page_scanner.js
class PageScanner {
  static scan() {
    const inputs = document.querySelectorAll('input, textarea, select');
    const fields = [];

    inputs.forEach(input => {
      // Find label
      let labelText = '';
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        labelText = label.innerText;
      } else {
        // Try parent or previous sibling
        labelText = input.parentElement.innerText || '';
      }

      fields.push({
        selector: this.getUniqueSelector(input),
        label: labelText.trim(),
        placeholder: input.placeholder || '',
        name: input.name || '',
        type: input.type
      });
    });

    return fields;
  }

  static getUniqueSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    // Fallback to a simple path (not perfect but works for many cases)
    return `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ').join('.') : ''}`;
  }
}
