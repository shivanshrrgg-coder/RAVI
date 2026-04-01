import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;

class AIService {
  final String apiKey = "YOUR_GEMINI_API_KEY";

  Future<Map<String, dynamic>> generateListing(File imageFile) async {
    // 1. Process Image (Resize to 1000x1000, JPEG, Remove EXIF)
    final bytes = await imageFile.readAsBytes();
    img.Image? image = img.decodeImage(bytes);
    if (image == null) throw Exception("Failed to decode image");

    img.Image resized = img.copyResize(image, width: 1000, height: 1000);
    final processedBytes = img.encodeJpg(resized, quality: 85);
    final base64Image = base64Encode(processedBytes);

    // 2. Call Gemini API
    final url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$apiKey';
    
    final response = await http.post(
      Uri.parse(url),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        "contents": [{
          "parts": [
            {"text": "Analyze this product image and generate a professional ecommerce listing. If it's a phone cover, identify the EXACT phone model (e.g., Samsung Galaxy S23) by looking at camera cutouts and logos. Return ONLY a JSON object with: title, description, bullet_points (array), keywords (array), price (in INR with ₹), category, model_compatibility, color."},
            {"inline_data": {"mime_type": "image/jpeg", "data": base64Image}}
          ]
        }],
        "generationConfig": {
          "response_mime_type": "application/json"
        }
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final text = data['candidates'][0]['content']['parts'][0]['text'];
      return jsonDecode(text);
    } else {
      throw Exception("AI Generation failed");
    }
  }
}
