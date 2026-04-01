// field_mapper.js
class FieldMapper {
  map(fields, data) {
    const mapping = {};
    
    fields.forEach(field => {
      const label = field.label.toLowerCase();
      const placeholder = field.placeholder.toLowerCase();
      const name = field.name.toLowerCase();

      if (this.isMatch(label, placeholder, name, ['title', 'product name', 'heading'])) {
        mapping[field.selector] = data.title;
      } else if (this.isMatch(label, placeholder, name, ['description', 'details', 'about'])) {
        mapping[field.selector] = data.description;
      } else if (this.isMatch(label, placeholder, name, ['price', 'cost', 'mrp'])) {
        mapping[field.selector] = data.price;
      } else if (this.isMatch(label, placeholder, name, ['category', 'type', 'department'])) {
        mapping[field.selector] = data.category;
      }
    });

    return mapping;
  }

  isMatch(label, placeholder, name, keywords) {
    return keywords.some(k => 
      label.includes(k) || placeholder.includes(k) || name.includes(k)
    );
  }
}
