import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Sparkles, Loader2, Image as ImageIcon, Check, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

interface SceneGeneratorProps {
  baseImage: string;
  onSceneGenerated: (newImage: string) => void;
}

const SCENES = [
  { id: 'studio', name: 'Pro Studio', prompt: 'Professional studio lighting, clean minimalist background, high-end product photography' },
  { id: 'office', name: 'Office Desk', prompt: 'Placed on a modern clean office desk with a laptop and coffee cup in the background, soft natural light' },
  { id: 'nature', name: 'Nature', prompt: 'Placed on a smooth stone in a serene garden with soft sunlight and green leaves in the background' },
  { id: 'luxury', name: 'Luxury', prompt: 'Placed on a velvet cushion inside a luxury boutique, warm elegant lighting, bokeh background' },
  { id: 'tech', name: 'Tech Setup', prompt: 'Placed on a gaming desk with RGB lighting and mechanical keyboard in the background' },
];

export const SceneGenerator: React.FC<SceneGeneratorProps> = ({ baseImage, onSceneGenerated }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedScene, setSelectedScene] = useState(SCENES[0].id);
  const [customPrompt, setCustomPrompt] = useState('');

  if (!baseImage) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key is missing.");
      }
      const ai = new GoogleGenAI({ apiKey });
      const scene = SCENES.find(s => s.id === selectedScene);
      
      const prompt = customPrompt || scene?.prompt || SCENES[0].prompt;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: baseImage.split(',')[1],
                mimeType: 'image/jpeg',
              },
            },
            {
              text: `Please edit this product image. ${prompt}. Keep the product exactly as it is, but change the background and lighting to match the scene. The product should look naturally integrated into the new environment.`,
            },
          ],
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          onSceneGenerated(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (err) {
      console.error("Scene generation failed:", err);
      alert("Failed to generate scene. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
      <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold">AI Scene Generator</h3>
        </div>
        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Powered by Gemini</span>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SCENES.map((scene) => (
            <button
              key={scene.id}
              onClick={() => setSelectedScene(scene.id)}
              className={`p-3 rounded-2xl border-2 transition-all text-left space-y-1 ${
                selectedScene === scene.id 
                  ? 'border-emerald-600 bg-emerald-50' 
                  : 'border-stone-100 hover:border-stone-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${selectedScene === scene.id ? 'text-emerald-700' : 'text-stone-600'}`}>
                  {scene.name}
                </span>
                {selectedScene === scene.id && <Check className="w-3 h-3 text-emerald-600" />}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Custom Scene (Optional)</label>
          <input 
            type="text"
            placeholder="e.g., On a marble table with rose petals..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50 shadow-lg shadow-stone-200"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Scene...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              Generate Lifestyle Scene
            </>
          )}
        </button>
      </div>
    </div>
  );
};
