import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  Sparkles, 
  Save, 
  History, 
  LogOut, 
  ChevronRight, 
  Edit3, 
  CheckCircle2,
  Loader2,
  X,
  RefreshCw,
  ShoppingBag,
  Settings,
  Search,
  Share2,
  TrendingUp,
  Globe,
  Download,
  Mic,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { cn } from './lib/utils';
import confetti from 'canvas-confetti';
import { LiveAgent } from './components/LiveAgent';
import { SceneGenerator } from './components/SceneGenerator';
import { MarketIntelligence } from './components/MarketIntelligence';

// --- Types ---

interface CompetitorPrice {
  platform: string;
  price: number;
  url: string;
}

interface ListingData {
  title: string;
  description: string;
  bullet_points: string[];
  keywords: string[];
  price: string;
  category: string;
  model_compatibility?: string;
  color?: string;
  material?: string;
  case_type?: string;
  finish?: string;
  market_comparison?: string;
  social_caption?: string;
  bulk_sheet_data?: Record<string, any>;
  competitor_prices?: CompetitorPrice[];
}

interface GenerationOptions {
  removeBackground: boolean;
  comparePrices: boolean;
  generateSocial: boolean;
  platform: 'Default' | 'Amazon' | 'Meesho' | 'Flipkart';
}

interface SavedListing extends ListingData {
  id: string;
  image_url: string;
  created_at: any;
}

interface TrendData {
  brand: string;
  top_models: string[];
  top_platforms: string[];
  trending_styles: string;
  last_updated: string;
  top_selling_cover?: {
    model: string;
    platform: string;
    price: string;
  };
}

interface ProductTrendInfo {
  productName: string;
  isTrending: boolean;
  topSellingPlatform: string;
  platforms: {
    name: string;
    price: string;
    url: string;
    popularity: string;
  }[];
  summary: string;
}

// --- AI Service ---

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please check your settings.");
  }
  return new GoogleGenAI({ apiKey });
};

const generateListing = async (base64Image: string, options: GenerationOptions): Promise<{ listing: ListingData, processedImage?: string }> => {
  const ai = getAI();
  let currentImage = base64Image;
  let processedImage: string | undefined;

  // 1. Background Removal (if selected)
  if (options.removeBackground) {
    try {
      const editResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/jpeg' } },
            { text: 'Remove the background of this product and replace it with a clean, professional pure white background. Keep the product exactly as it is.' }
          ]
        }
      });
      
      for (const part of editResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          processedImage = `data:image/png;base64,${part.inlineData.data}`;
          currentImage = processedImage;
          break;
        }
      }
    } catch (e) {
      console.error("Background removal failed", e);
    }
  }

  // 2. Main Listing Generation
  const platformPrompt = options.platform !== 'Default' 
    ? ` Optimize this listing specifically for ${options.platform} guidelines.` 
    : '';
    
  const marketPrompt = options.comparePrices 
    ? " Also, search the web to find current market prices for similar products on Amazon and Meesho, and provide a brief comparison." 
    : "";
    
  const socialPrompt = options.generateSocial 
    ? " Also, write a catchy Instagram/Facebook caption with relevant hashtags for this product." 
    : "";

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: currentImage.split(',')[1],
            },
          },
          {
            text: `Analyze this product image with extreme precision to generate a professional ecommerce listing. 
            
            CRITICAL IDENTIFICATION STEPS:
            1. CAMERA ARCHITECTURE: Analyze the exact cutout shape, lens arrangement, flash position, and sensor holes to identify the primary and secondary compatible phone models.
            2. SHARED COMPATIBILITY: Determine if this cover fits multiple models (e.g., iPhone 7/8/SE, or various Samsung/Redmi models that share the same chassis). List ALL compatible models.
            3. STRUCTURAL DETAILS: 
               - BUTTON PLACEMENTS: Observe the exact positions of volume rockers, power buttons, and alert sliders (e.g., iPhone vs. OnePlus).
               - SPEAKER & PORT CUTOUTS: Analyze the number and arrangement of speaker grill holes and the shape of the charging port cutout.
               - LOGOS & BRANDING: Look for any embossed or printed logos (Apple, Samsung, Google, etc.) or text on the product.
            4. MATERIAL REASONING: 
               - If it has a soft, non-reflective, "rubbery" look, it is likely Liquid Silicone.
               - If it shows grain, stitching, or organic texture, it is Leather/Vegan Leather.
               - If it is rigid with sharp reflections, it is Polycarbonate (Hard Plastic).
               - If it is flexible and clear/translucent, it is TPU (Soft Plastic).
            5. CASE TYPE CLASSIFICATION:
               - Look for a circular ring on the back (MagSafe Compatible).
               - Look for reinforced/thickened corners (Rugged/Shockproof).
               - Look for a front cover (Flip/Wallet Case).
            6. FINISH IDENTIFICATION: Distinguish between Matte (diffuse light), Glossy (sharp reflections), Frosted (blurred transparency), or Carbon Fiber texture.
            
            Identify ALL compatible phone models, COLOR, MATERIAL, CASE TYPE, and FINISH. 
            
            ${marketPrompt} ${socialPrompt} 
            
            Return ONLY a JSON object with: title, description, bullet_points (array), keywords (array), price (in INR with ₹), category, model_compatibility (list all compatible models separated by '/'), color, material, case_type, finish, market_comparison (if requested), social_caption (if requested).
            Also include a field 'bulk_sheet_data' which is an object containing keys mapped to standard ecommerce catalog columns for ${options.platform === 'Default' ? 'Amazon/Meesho' : options.platform}.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: `You are a world-class ecommerce product cataloger specializing in mobile accessories for Indian marketplaces (Amazon, Meesho, Flipkart). 
      Your task is to identify products from images with 100% accuracy and prepare data for BULK UPLOAD SHEETS. 
      
      CRITICAL: Many phone covers are compatible with multiple models (Shared Compatibility). You MUST identify if the cover fits more than one smartphone model and list all of them in the 'model_compatibility' field. Ensure the Title and Keywords reflect this shared compatibility to maximize search visibility.
      
      DYNAMIC UPDATES: You MUST use Google Search to stay updated with the LATEST smartphone releases (e.g., iPhone 16, Samsung S25, etc.). If a new model has been released recently, prioritize identifying it if the physical features match.
      
      For phone covers, you MUST perform a deep structural and material analysis to determine the EXACT model compatibility:
      - CAMERA MODULE: Compare the cutout shape, lens arrangement, and flash position against known smartphone specifications.
      - PHYSICAL CONTROLS: Verify button placements (left vs. right side), alert slider presence, and cutout precision for ports.
      - SPEAKER GRILLS: Analyze the speaker grill pattern (number of holes, symmetry) which is often unique to specific models.
      - BRANDING: Identify any manufacturer logos or branding marks.
      - MATERIAL INDICATORS: 
          - Silicone: Smooth, matte, uniform color, soft edges.
          - Leather: Grain texture, stitching, patina, or embossed logos.
          - TPU: Flexible, often transparent or translucent, glossy or frosted.
          - Polycarbonate: Rigid, thin, often has "snap-on" edges, sharp reflections.
          - Rugged: Dual-layer construction, visible screws, or heavy corner bumpers.
      - SPECIAL FEATURES: Identify MagSafe rings, kickstands, card slots, or camera lens sliders.
      - COLOR: Identify the specific manufacturer shade (e.g., 'Titanium Gray', 'Deep Purple', 'Midnight').
      
      Use Google Search to cross-reference these physical features with the latest smartphone releases to ensure the 'model_compatibility' field is perfectly accurate. ${platformPrompt}`,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          bullet_points: { type: Type.ARRAY, items: { type: Type.STRING } },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          price: { type: Type.STRING },
          category: { type: Type.STRING },
          model_compatibility: { type: Type.STRING },
          color: { type: Type.STRING },
          material: { type: Type.STRING },
          case_type: { type: Type.STRING },
          finish: { type: Type.STRING },
          market_comparison: { type: Type.STRING },
          social_caption: { type: Type.STRING },
          bulk_sheet_data: { type: Type.OBJECT },
          competitor_prices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                platform: { type: Type.STRING },
                price: { type: Type.NUMBER },
                url: { type: Type.STRING },
              }
            }
          }
        },
        required: ["title", "description", "bullet_points", "keywords", "price", "category", "model_compatibility", "color", "material", "case_type", "finish", "bulk_sheet_data", "competitor_prices"],
      },
    },
  });

  const text = response.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;

  return { 
    listing: JSON.parse(jsonStr), 
    processedImage 
  };
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [listing, setListing] = useState<ListingData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [isAnalyzingTrends, setIsAnalyzingTrends] = useState(false);
  const [selectedTrendBrand, setSelectedTrendBrand] = useState('Samsung');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productTrendResult, setProductTrendResult] = useState<ProductTrendInfo | null>(null);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [options, setOptions] = useState<GenerationOptions>({
    removeBackground: false,
    comparePrices: false,
    generateSocial: false,
    platform: 'Default'
  });
  const [bulkImages, setBulkImages] = useState<string[]>([]);
  const [currentBulkIndex, setCurrentBulkIndex] = useState(0);
  const [history, setHistory] = useState<SavedListing[]>([]);
  const [view, setView] = useState<'home' | 'capture' | 'preview' | 'history' | 'trends'>('home');
  const [error, setError] = useState<string | null>(null);
  const [isLiveAgentOpen, setIsLiveAgentOpen] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Auth & Connection Test ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        testConnection();
      }
    });
    return () => unsubscribe();
  }, []);

  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error: any) {
      if (error.message?.includes('the client is offline')) {
        console.error("Firebase connection error: Client is offline.");
      }
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Initialize user profile in Firestore
      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
        createdAt: serverTimestamp()
      }, { merge: true });

    } catch (err: any) {
      setError("Login failed: " + err.message);
    }
  };

  const handleLiveCapture = (base64: string) => {
    setCapturedImage(base64);
    setIsLiveAgentOpen(false);
    setView('preview');
    handleGenerate(false, base64);
  };

  const handleLogout = () => signOut(auth);

  // --- History Listener ---

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'listings'),
      orderBy('created_at', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedListing));
      setHistory(items);
    }, (err) => {
      console.error("Firestore error:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // --- Camera Logic ---

  const startCamera = async () => {
    try {
      setIsCapturing(true);
      setView('capture');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: 1000, height: 1000 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError("Camera access denied.");
      setView('home');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsCapturing(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Resize to 1000x1000
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Crop to square if needed
      const size = Math.min(video.videoWidth, video.videoHeight);
      const x = (video.videoWidth - size) / 2;
      const y = (video.videoHeight - size) / 2;
      ctx.drawImage(video, x, y, size, size, 0, 0, 1000, 1000);
      
      // Convert to JPEG with 85% compression
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
      setBulkImages([]); // Reset bulk if manual capture
      stopCamera();
      setView('preview');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const readers = Array.from(files).map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });

      Promise.all(readers).then(results => {
        if (results.length > 1) {
          setBulkImages(results);
          setCapturedImage(results[0]);
        } else {
          setCapturedImage(results[0]);
          setBulkImages([]);
        }
        setView('preview');
      });
    }
  };

  // --- AI Generation ---

  const handleGenerate = async (isConfirmed = false, overrideImage?: string) => {
    const imageToProcess = overrideImage || capturedImage;
    if (!imageToProcess) return;

    if (bulkImages.length > 0 && !isConfirmed && !overrideImage) {
      setShowBulkConfirm(true);
      return;
    }

    setShowBulkConfirm(false);
    setIsGenerating(true);
    setError(null);
    try {
      if (bulkImages.length > 0 && !overrideImage) {
        // Handle Bulk
        for (let i = 0; i < bulkImages.length; i++) {
          setCurrentBulkIndex(i);
          setCapturedImage(bulkImages[i]);
          const result = await generateListing(bulkImages[i], options);
          
          // Auto-save bulk items
          const blob = await (await fetch(result.processedImage || bulkImages[i])).blob();
          const imageRef = ref(storage, `users/${user?.uid}/listings/${Date.now()}_${i}.jpg`);
          await uploadBytes(imageRef, blob);
          const imageUrl = await getDownloadURL(imageRef);

          await addDoc(collection(db, 'users', user?.uid as string, 'listings'), {
            ...result.listing,
            uid: user?.uid,
            image_url: imageUrl,
            created_at: serverTimestamp()
          });
        }
        setBulkImages([]);
        setView('home');
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 }
        });
        alert("Bulk processing complete! All items saved to your dashboard.");
      } else {
        const result = await generateListing(imageToProcess, options);
        setListing(result.listing);
        if (result.processedImage) setCapturedImage(result.processedImage);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } catch (err: any) {
      setError("AI Generation failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchTrends = async (brand: string) => {
    setIsAnalyzingTrends(true);
    const currentDate = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Search Google for the most trending and best-selling phone covers for ${brand} in India right now (${currentDate}). 
        Identify the top 3 specific phone models whose covers are in high demand and which platforms (Amazon, Flipkart, Meesho) they are selling best on. 
        Specifically identify ONE phone model cover that is the ABSOLUTE #1 best-seller right now and which website it is selling most on.
        Provide a summary of trending styles (e.g., 'Aesthetic Korean style', 'Heavy duty rugged'). 
        Return ONLY a JSON object with: brand, top_models (array), top_platforms (array), trending_styles (string), last_updated (string), top_selling_cover (object with model, platform, price).`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              brand: { type: Type.STRING },
              top_models: { type: Type.ARRAY, items: { type: Type.STRING } },
              top_platforms: { type: Type.ARRAY, items: { type: Type.STRING } },
              trending_styles: { type: Type.STRING },
              last_updated: { type: Type.STRING },
              top_selling_cover: {
                type: Type.OBJECT,
                properties: {
                  model: { type: Type.STRING },
                  platform: { type: Type.STRING },
                  price: { type: Type.STRING }
                },
                required: ["model", "platform", "price"]
              }
            },
            required: ["brand", "top_models", "top_platforms", "trending_styles", "last_updated", "top_selling_cover"]
          }
        }
      });
      setTrendData(JSON.parse(response.text || '{}'));
    } catch (err) {
      console.error("Trend analysis failed", err);
    } finally {
      setIsAnalyzingTrends(false);
    }
  };

  const searchProductTrends = async (query: string) => {
    if (!query) return;
    setIsSearchingProduct(true);
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Search Google for real-time market data for the product: "${query}". 
        Find out:
        1. Is it currently trending or in high demand?
        2. Which website/platform is it selling MOST on right now?
        3. List prices and availability on major platforms like Amazon, Flipkart, and Meesho.
        4. Provide a brief summary of what exactly is selling most within this product category (e.g. which specific variant or color).
        
        Return ONLY a JSON object with: productName, isTrending (boolean), topSellingPlatform (string), platforms (array of objects with name, price, url, popularity), summary (string).`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING },
              isTrending: { type: Type.BOOLEAN },
              topSellingPlatform: { type: Type.STRING },
              platforms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    price: { type: Type.STRING },
                    url: { type: Type.STRING },
                    popularity: { type: Type.STRING }
                  },
                  required: ["name", "price", "url", "popularity"]
                }
              },
              summary: { type: Type.STRING }
            },
            required: ["productName", "isTrending", "topSellingPlatform", "platforms", "summary"]
          }
        }
      });
      setProductTrendResult(JSON.parse(response.text || '{}'));
    } catch (err) {
      console.error("Product search failed", err);
      setError("Failed to fetch product trends.");
    } finally {
      setIsSearchingProduct(false);
    }
  };

  useEffect(() => {
    if (view === 'trends' && !trendData && !isAnalyzingTrends) {
      fetchTrends(selectedTrendBrand);
    }
  }, [view]);

  const downloadBulkSheet = () => {
    if (!listing?.bulk_sheet_data) return;
    
    const headers = Object.keys(listing.bulk_sheet_data).join(",");
    const values = Object.values(listing.bulk_sheet_data).map(v => `"${v}"`).join(",");
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${values}`;
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${options.platform}_bulk_upload_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = async () => {
    if (!user || !listing || !capturedImage) return;
    setLoading(true);
    try {
      // 1. Upload Image to Storage
      const blob = await (await fetch(capturedImage)).blob();
      const imageRef = ref(storage, `users/${user.uid}/listings/${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      // 2. Save to Firestore
      await addDoc(collection(db, 'users', user.uid, 'listings'), {
        ...listing,
        uid: user.uid,
        image_url: imageUrl,
        created_at: serverTimestamp()
      });

      setView('home');
      setListing(null);
      setCapturedImage(null);
    } catch (err: any) {
      setError("Save failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- UI Components ---

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-emerald-600 rounded-2xl flex items-center justify-center mb-8 shadow-xl shadow-emerald-200">
          <ShoppingBag className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 mb-4">SnapList AI</h1>
        <p className="text-stone-500 max-w-xs mb-12">
          Transform product photos into professional ecommerce listings in seconds.
        </p>
        <button 
          onClick={handleLogin}
          className="w-full max-w-xs bg-stone-900 text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-stone-800 transition-colors shadow-lg"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5 invert" alt="Google" />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-stone-200 flex-col p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">SnapList AI</span>
        </div>
        
        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setView('home')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${view === 'home' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            <Camera className="w-5 h-5" />
            Home
          </button>
          <button 
            onClick={() => setView('trends')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${view === 'trends' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            <TrendingUp className="w-5 h-5" />
            Trends
          </button>
          <button 
            onClick={() => setView('history')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${view === 'history' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            <History className="w-5 h-5" />
            History
          </button>
        </nav>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-stone-400 hover:text-red-500 transition-colors font-bold mt-auto"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header (Mobile Only) */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">SnapList AI</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView('trends')}
              className={`p-2 rounded-full transition-colors ${view === 'trends' ? 'bg-emerald-100 text-emerald-600' : 'text-stone-500 hover:bg-stone-100'}`}
            >
              <TrendingUp className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setView('history')}
              className={`p-2 rounded-full transition-colors ${view === 'history' ? 'bg-emerald-100 text-emerald-600' : 'text-stone-500 hover:bg-stone-100'}`}
            >
              <History className="w-6 h-6" />
            </button>
          </div>
        </header>

        <main className={`w-full p-6 pb-32 transition-all mx-auto ${view === 'trends' ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 text-center space-y-6">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Create New Listing</h2>
                    <p className="text-stone-500">Take a photo or upload multiple images for bulk processing.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => {
                        console.log("Opening Live Agent...");
                        setIsLiveAgentOpen(true);
                      }}
                      className="bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-xl flex items-center justify-center gap-2 border border-zinc-700 relative z-10"
                    >
                      <Mic className="w-5 h-5 text-emerald-400" />
                      Live Agent Mode
                    </button>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={startCamera}
                        className="bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        <Camera className="w-5 h-5" />
                        Snap
                      </button>
                      <label className="bg-white text-stone-900 border-2 border-stone-100 py-4 rounded-2xl font-bold hover:bg-stone-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                        <Upload className="w-5 h-5" />
                        Upload
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Market Trends Shortcut */}
                <div 
                  onClick={() => setView('trends')}
                  className="bg-emerald-600 p-6 rounded-3xl text-white cursor-pointer hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Market Trends
                    </h3>
                    <p className="text-emerald-100 text-sm">See what's selling best for Samsung, Apple & more.</p>
                  </div>
                  <ChevronRight className="w-6 h-6 text-emerald-200" />
                </div>

              {history.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Recent Listings</h3>
                    <button onClick={() => setView('history')} className="text-emerald-600 font-semibold text-sm">View All</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {history.slice(0, 4).map((item) => (
                      <div key={item.id} className="bg-white p-3 rounded-2xl border border-stone-200 space-y-3">
                        <img 
                          src={item.image_url} 
                          className="w-full aspect-square object-cover rounded-xl" 
                          alt={item.title}
                          referrerPolicy="no-referrer"
                        />
                        <div className="space-y-1">
                          <p className="font-bold text-sm truncate">{item.title}</p>
                          <p className="text-emerald-600 font-bold text-xs">{item.price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'capture' && (
            <motion.div 
              key="capture"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex flex-col"
            >
              <div className="flex-1 relative overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                  <div className="w-full h-full border-2 border-white/50 rounded-2xl" />
                </div>
                <button 
                  onClick={() => { stopCamera(); setView('home'); }}
                  className="absolute top-8 right-8 p-3 bg-white/10 backdrop-blur-md rounded-full text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="h-40 bg-black flex items-center justify-center">
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full border-4 border-white/20 p-1"
                >
                  <div className="w-full h-full bg-white rounded-full border-2 border-black/10" />
                </button>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          )}

          {view === 'preview' && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl bg-stone-200">
                {capturedImage && (
                  <img src={capturedImage} className="w-full h-full object-cover" alt="Captured" />
                )}
                <button 
                  onClick={() => setView('capture')}
                  className="absolute top-4 right-4 p-3 bg-black/50 backdrop-blur-md rounded-full text-white"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>

              {!listing ? (
                <div className="space-y-6">
                  {/* Options Section */}
                  <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-6">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Generation Options
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-10 h-6 rounded-full transition-colors relative ${options.removeBackground ? 'bg-emerald-500' : 'bg-stone-300'}`}
                               onClick={() => setOptions({...options, removeBackground: !options.removeBackground})}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${options.removeBackground ? 'left-5' : 'left-1'}`} />
                          </div>
                          <span className="text-sm font-medium text-stone-600">Remove Background</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-10 h-6 rounded-full transition-colors relative ${options.comparePrices ? 'bg-emerald-500' : 'bg-stone-300'}`}
                               onClick={() => setOptions({...options, comparePrices: !options.comparePrices})}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${options.comparePrices ? 'left-5' : 'left-1'}`} />
                          </div>
                          <span className="text-sm font-medium text-stone-600">Market Price Comparison</span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-10 h-6 rounded-full transition-colors relative ${options.generateSocial ? 'bg-emerald-500' : 'bg-stone-300'}`}
                               onClick={() => setOptions({...options, generateSocial: !options.generateSocial})}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${options.generateSocial ? 'left-5' : 'left-1'}`} />
                          </div>
                          <span className="text-sm font-medium text-stone-600">Social Media Post</span>
                        </label>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Target Platform</label>
                        <select 
                          value={options.platform}
                          onChange={(e) => setOptions({...options, platform: e.target.value as any})}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="Default">Default (General)</option>
                          <option value="Amazon">Amazon India</option>
                          <option value="Meesho">Meesho</option>
                          <option value="Flipkart">Flipkart</option>
                        </select>
                        <p className="text-[10px] text-stone-400 italic">Optimizes description & keywords for the platform.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-3xl border border-stone-200 text-center space-y-6">
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold">Ready to Generate?</h2>
                      <p className="text-stone-500">
                        {bulkImages.length > 0 
                          ? `AI will process all ${bulkImages.length} images and save them to your cloud.` 
                          : 'AI will analyze your photo and create a listing.'}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleGenerate()}
                      disabled={isGenerating}
                      className="w-full bg-stone-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          {bulkImages.length > 0 ? `Processing ${currentBulkIndex + 1}/${bulkImages.length}...` : 'Analyzing Image...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-6 h-6 text-emerald-400" />
                          {bulkImages.length > 0 ? `Process Bulk (${bulkImages.length})` : 'Generate Listing'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold">AI Generated Listing</h2>
                      <button onClick={() => setListing(null)} className="text-stone-400"><Edit3 className="w-5 h-5" /></button>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Title</label>
                        <input 
                          value={listing.title} 
                          onChange={(e) => setListing({...listing, title: e.target.value})}
                          className="w-full text-lg font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Price (INR)</label>
                          <input 
                            value={listing.price} 
                            onChange={(e) => setListing({...listing, price: e.target.value})}
                            className="w-full font-bold text-emerald-600 border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Category</label>
                          <input 
                            value={listing.category} 
                            onChange={(e) => setListing({...listing, category: e.target.value})}
                            className="w-full font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Model Compatibility</label>
                          <input 
                            value={listing.model_compatibility || ''} 
                            onChange={(e) => setListing({...listing, model_compatibility: e.target.value})}
                            placeholder="e.g. iPhone 15"
                            className="w-full font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Color</label>
                          <input 
                            value={listing.color || ''} 
                            onChange={(e) => setListing({...listing, color: e.target.value})}
                            placeholder="e.g. Midnight Blue"
                            className="w-full font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Material</label>
                          <input 
                            value={listing.material || ''} 
                            onChange={(e) => setListing({...listing, material: e.target.value})}
                            placeholder="e.g. Silicone"
                            className="w-full font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Type</label>
                          <input 
                            value={listing.case_type || ''} 
                            onChange={(e) => setListing({...listing, case_type: e.target.value})}
                            placeholder="e.g. Back Cover"
                            className="w-full font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Finish</label>
                          <input 
                            value={listing.finish || ''} 
                            onChange={(e) => setListing({...listing, finish: e.target.value})}
                            placeholder="e.g. Matte"
                            className="w-full font-bold border-b border-stone-100 py-2 focus:border-emerald-500 outline-none"
                          />
                        </div>
                      </div>

                      {listing.market_comparison && (
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                          <label className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-2 mb-2">
                            <Search className="w-3 h-3" />
                            Market Comparison
                          </label>
                          <p className="text-sm text-stone-700 leading-relaxed italic">
                            {listing.market_comparison}
                          </p>
                        </div>
                      )}

                      {listing.social_caption && (
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                          <label className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 mb-2">
                            <Share2 className="w-3 h-3" />
                            Social Media Post
                          </label>
                          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                            {listing.social_caption}
                          </p>
                          <button 
                            onClick={() => navigator.clipboard.writeText(listing.social_caption || '')}
                            className="mt-3 text-xs font-bold text-indigo-600 hover:underline"
                          >
                            Copy Caption
                          </button>
                        </div>
                      )}

                      {listing.competitor_prices && listing.competitor_prices.length > 0 && (
                        <MarketIntelligence 
                          prices={listing.competitor_prices} 
                          currentPrice={listing.price} 
                        />
                      )}

                      <SceneGenerator 
                        baseImage={capturedImage} 
                        onSceneGenerated={(newImage) => setCapturedImage(newImage)} 
                      />

                      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
                        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                          <div className="flex items-center gap-2">
                            <Globe className="w-5 h-5 text-emerald-600" />
                            <h3 className="font-bold">Platform Mockups</h3>
                          </div>
                        </div>
                        <div className="p-6">
                          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                            {['Amazon', 'Flipkart', 'Meesho', 'Instagram'].map((platform) => (
                              <div key={platform} className="min-w-[240px] bg-stone-50 rounded-2xl border border-stone-100 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{platform} Preview</span>
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                </div>
                                <div className="aspect-[4/3] bg-white rounded-xl overflow-hidden border border-stone-100 relative">
                                  <img src={capturedImage} className="w-full h-full object-cover" alt="Mockup" />
                                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                                    <p className="text-white text-[10px] font-bold truncate">{listing.title}</p>
                                    <p className="text-emerald-400 text-[10px] font-bold">{listing.price}</p>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="h-1.5 w-full bg-stone-200 rounded-full" />
                                  <div className="h-1.5 w-2/3 bg-stone-200 rounded-full" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Description</label>
                        <textarea 
                          value={listing.description} 
                          onChange={(e) => setListing({...listing, description: e.target.value})}
                          rows={4}
                          className="w-full text-sm text-stone-600 border border-stone-100 rounded-xl p-3 mt-2 focus:border-emerald-500 outline-none resize-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Bullet Points</label>
                        <ul className="mt-2 space-y-2">
                          {listing.bullet_points.map((point, i) => (
                            <li key={i} className="flex gap-2 text-sm text-stone-600">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <input 
                                value={point}
                                onChange={(e) => {
                                  const newPoints = [...listing.bullet_points];
                                  newPoints[i] = e.target.value;
                                  setListing({...listing, bullet_points: newPoints});
                                }}
                                className="w-full outline-none"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={handleSave}
                      className="bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                    >
                      <Save className="w-6 h-6" />
                      Save
                    </button>
                    <button 
                      onClick={downloadBulkSheet}
                      className="bg-stone-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-stone-800 transition-all shadow-lg shadow-stone-100 flex items-center justify-center gap-2"
                    >
                      <Download className="w-6 h-6" />
                      Bulk Export
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('home')} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-6 h-6" /></button>
                <h2 className="text-2xl font-bold">My Listings</h2>
              </div>

              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="bg-white p-4 rounded-3xl border border-stone-200 flex gap-4">
                    <img 
                      src={item.image_url} 
                      className="w-24 h-24 object-cover rounded-2xl shrink-0" 
                      alt={item.title}
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                      <div>
                        <h4 className="font-bold truncate">{item.title}</h4>
                        <p className="text-stone-400 text-xs">{item.category}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-600 font-bold">{item.price}</span>
                        <ChevronRight className="w-5 h-5 text-stone-300" />
                      </div>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-20 text-stone-400">
                    No listings yet.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'trends' && (
            <motion.div 
              key="trends"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setView('home')} className="lg:hidden p-2 hover:bg-stone-100 rounded-full"><X className="w-6 h-6" /></button>
                  <h2 className="text-2xl font-bold">Market Insights (बाज़ार के रुझान)</h2>
                </div>
              </div>

              {/* Product Search Section */}
              <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <div className="space-y-2">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Search className="w-5 h-5 text-emerald-600" />
                    Product Search (प्रोडक्ट खोजें)
                  </h3>
                  <p className="text-stone-500 text-sm">Enter a product name to see where it's selling best and at what price.</p>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchProductTrends(productSearchQuery)}
                    placeholder="e.g. iPhone 15 Pro Max cover"
                    className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                  />
                  <button 
                    onClick={() => searchProductTrends(productSearchQuery)}
                    disabled={isSearchingProduct}
                    className="bg-stone-900 text-white px-8 rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-50"
                  >
                    {isSearchingProduct ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                  </button>
                </div>

                {productTrendResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-6 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-bold text-emerald-900 text-lg">{productTrendResult.productName}</h4>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${productTrendResult.isTrending ? 'bg-emerald-200 text-emerald-700' : 'bg-stone-200 text-stone-600'}`}>
                            {productTrendResult.isTrending ? 'Trending Now' : 'Stable Demand'}
                          </span>
                          <span className="text-xs text-emerald-700 font-medium">
                            Selling most on: <span className="font-bold">{productTrendResult.topSellingPlatform}</span>
                          </span>
                        </div>
                      </div>
                      <button onClick={() => setProductTrendResult(null)} className="text-emerald-400 hover:text-emerald-600">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {productTrendResult.platforms.map((p, i) => (
                        <a 
                          key={i}
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white p-4 rounded-xl border border-emerald-100 hover:shadow-md transition-all group"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-stone-400 uppercase">{p.name}</span>
                            <ExternalLink className="w-3 h-3 text-stone-300 group-hover:text-emerald-500" />
                          </div>
                          <p className="text-lg font-bold text-emerald-600">{p.price}</p>
                          <p className="text-[10px] font-medium text-stone-500 mt-1">Popularity: {p.popularity}</p>
                        </a>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-emerald-100">
                      <p className="text-sm text-emerald-800 leading-relaxed italic">
                        <Sparkles className="w-4 h-4 inline mr-2 mb-1" />
                        {productTrendResult.summary}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Brand Selection Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-400 px-2">Brand Trends (ब्रांड के रुझान)</label>
                  <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-hide">
                    {['Samsung', 'Apple', 'Redmi', 'Vivo', 'Oppo', 'OnePlus'].map(brand => (
                      <button
                        key={brand}
                        onClick={() => {
                          setSelectedTrendBrand(brand);
                          fetchTrends(brand);
                        }}
                        className={`px-6 py-2 lg:px-4 lg:py-3 rounded-full lg:rounded-xl font-bold text-sm whitespace-nowrap transition-all text-left ${selectedTrendBrand === brand ? 'bg-stone-900 text-white shadow-lg shadow-stone-200' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Results Area */}
                <div className="lg:col-span-3">
                  {isAnalyzingTrends ? (
                    <div className="bg-white p-12 rounded-3xl border border-stone-200 flex flex-col items-center justify-center space-y-4">
                      <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
                      <p className="font-bold text-stone-500">Analyzing market data for {selectedTrendBrand}...</p>
                    </div>
                  ) : trendData ? (
                    <div className="space-y-6">
                      {/* Top Selling Cover Card */}
                      {trendData.top_selling_cover && (
                        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 rounded-3xl text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
                          <div className="relative z-10 space-y-4">
                            <div className="flex items-center gap-2">
                              <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest">
                                #1 Best Seller
                              </div>
                              <span className="text-emerald-200 text-xs font-medium">Top Selling Phone Cover</span>
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-3xl font-bold">{trendData.top_selling_cover.model}</h3>
                              <p className="text-emerald-100 text-lg">Selling most on <span className="font-bold underline">{trendData.top_selling_cover.platform}</span> at <span className="font-bold">{trendData.top_selling_cover.price}</span></p>
                            </div>
                          </div>
                          <div className="absolute -bottom-4 -right-4 opacity-10">
                            <ShoppingBag className="w-48 h-48" />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-4">
                          <h4 className="font-bold flex items-center gap-2 text-stone-400 uppercase text-xs tracking-widest">
                            <TrendingUp className="w-4 h-4" />
                            Top Selling Models
                          </h4>
                          <div className="space-y-2">
                            {trendData.top_models.map((model, i) => (
                              <div key={i} className="flex items-center gap-3 p-3 bg-stone-50 rounded-2xl font-bold">
                                <span className="text-emerald-600">0{i+1}</span>
                                {model}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-4">
                          <h4 className="font-bold flex items-center gap-2 text-stone-400 uppercase text-xs tracking-widest">
                            <Globe className="w-4 h-4" />
                            Best Platforms
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {trendData.top_platforms.map((platform, i) => (
                              <span key={i} className="px-3 py-1 bg-stone-50 border border-stone-100 rounded-lg text-xs font-bold text-stone-600">
                                {platform}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-emerald-900 p-8 rounded-3xl text-white space-y-4 relative overflow-hidden">
                        <div className="relative z-10 space-y-2">
                          <h4 className="font-bold flex items-center gap-2 text-emerald-300 uppercase text-xs tracking-widest">
                            <Sparkles className="w-4 h-4" />
                            Trending Styles & Demand
                          </h4>
                          <p className="text-xl font-medium leading-relaxed italic">"{trendData.trending_styles}"</p>
                        </div>
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                          <TrendingUp className="w-32 h-32" />
                        </div>
                        <div className="pt-4 border-t border-white/10 text-[10px] text-emerald-400">
                          Last updated: {trendData.last_updated}. Data analyzed using live Google Search grounding.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-12 rounded-3xl border border-stone-200 text-center space-y-4">
                      <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto text-stone-300">
                        <TrendingUp className="w-8 h-8" />
                      </div>
                      <p className="text-stone-500 font-medium">Select a brand to see what's trending in the market.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bulk Confirmation Modal */}
      <AnimatePresence>
        {showBulkConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBulkConfirm(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-6"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto">
                <Sparkles className="w-8 h-8" />
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold">Confirm Bulk Process</h3>
                <p className="text-stone-500">
                  You are about to generate listings for <span className="font-bold text-stone-900">{bulkImages.length} images</span>. 
                  This will automatically save each result to your cloud history.
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">Total Images</span>
                  <span className="font-bold">{bulkImages.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">Platform</span>
                  <span className="font-bold">{options.platform}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">Background Removal</span>
                  <span className="font-bold text-emerald-600">{options.removeBackground ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleGenerate(true)}
                  className="w-full bg-stone-900 text-white py-4 rounded-2xl font-bold hover:bg-stone-800 transition-all"
                >
                  Start Processing
                </button>
                <button 
                  onClick={() => setShowBulkConfirm(false)}
                  className="w-full bg-stone-100 text-stone-600 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                >
                  Cancel & Review
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-8 left-6 right-6 z-50 bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between"
          >
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)}><X className="w-5 h-5" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLiveAgentOpen && (
          <LiveAgent 
            onCaptureImage={handleLiveCapture}
            onClose={() => setIsLiveAgentOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  </div>
);
}
