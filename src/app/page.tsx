/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { DateTime } from 'luxon';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const DEFAULT_DAILY_GOAL = 2000;
const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_KEY;

// Profile types and their ideal macro percentages
type ProfileType = 'General' | 'Weight Loss' | 'Muscle Building' | 'Endurance Athletes';

const PROFILE_MACRO_PERCENTAGES: Record<ProfileType, { carbs: number; protein: number; fat: number }> = {
  'General': {
    carbs: 45, // 45% of calories from carbs
    protein: 25, // 25% of calories from protein  
    fat: 30, // 30% of calories from fat
  },
  'Weight Loss': {
    carbs: 35, // Lower carbs for weight loss
    protein: 35, // Higher protein to preserve muscle
    fat: 30, // Moderate fat
  },
  'Muscle Building': {
    carbs: 40, // Moderate carbs for energy
    protein: 35, // High protein for muscle synthesis
    fat: 25, // Lower fat to prioritize protein
  },
  'Endurance Athletes': {
    carbs: 55, // High carbs for endurance performance
    protein: 20, // Moderate protein
    fat: 25, // Lower fat
  },
};

interface MacroData {
  carbs: number;
  protein: number;
  fat: number;
}

interface LogEntry {
  id: string;
  text: string;
  calories: number;
  macros: MacroData;
  timestamp: number;
}

// New interface for daily history entries
interface DailyHistoryEntry {
  date: string; // Format: YYYY-MM-DD
  totalCalories: number;
  mealLog: LogEntry[];
  dailyGoalAtTheTime: number; // Store the goal active for that day
}

// Define a type for the content array elements
type OpenAIPromptContent = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

// Function to generate a short meal description from an image
const generateMealDescriptionFromImage = async (imageBase64: string): Promise<string | null> => {
  if (!OPENAI_API_KEY) {
    console.error('OpenAI API key is not configured for description generation.');
    return null;
  }
  const descriptionSystemMessage = "You are an image analysis assistant. Your task is to provide a very short, concise description of the food in an image, suitable for a food log. Describe the main food item(s) in 2-5 words. For example: 'Chicken salad sandwich' or 'Bowl of mixed berries'. If you cannot clearly identify the food, respond with 'Processed food image'.";
  const userPromptForDescription = "Describe the food in the provided image.";
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: descriptionSystemMessage },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPromptForDescription },
              { type: 'image_url', image_url: { url: imageBase64 } },
            ],
          },
        ],
        max_tokens: 25, 
        temperature: 0.4,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error (Description Generation):', errorData);
      return null;
    }
    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim();
    if (description && description.toLowerCase() !== 'processed food image') {
      return description;
    }    
    console.warn('Failed to get a distinct description or got fallback:', description);
    return null; 
  } catch (err) {
    console.error('Error in generateMealDescriptionFromImage:', err);
    return null;
  }
};

// Helper to resize image to max dimension (e.g., 512px)
const resizeImage = (file: File, maxSize = 512): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return reject('Failed to read image');
      img.src = e.target.result as string;
    };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Failed to get canvas context');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // JPEG, quality 85%
    };
    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Add this new component before the HomePage component
const CalorieHistoryGraph = ({ history }: { history: DailyHistoryEntry[] }) => {
  // Sort history by date ascending for the graph
  const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const data: ChartData<'line'> = {
    labels: sortedHistory.map(entry => new Date(entry.date).toLocaleDateString([], { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Calories Consumed',
        data: sortedHistory.map(entry => entry.totalCalories),
        borderColor: 'rgb(14, 165, 233)', // sky-500
        backgroundColor: 'rgba(14, 165, 233, 0.5)',
        tension: 0.4,
      },
      {
        label: 'Daily Goal',
        data: sortedHistory.map(entry => entry.dailyGoalAtTheTime),
        borderColor: 'rgb(148, 163, 184)', // slate-400
        backgroundColor: 'rgba(148, 163, 184, 0.5)',
        borderDash: [5, 5],
        tension: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Calorie Intake History',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Calories',
        },
      },
    },
  };

  return (
    <div className="w-full h-64 mb-6">
      <Line data={data} options={options} />
    </div>
  );
};

export default function HomePage() {
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [dailyGoalInput, setDailyGoalInput] = useState<string>(DEFAULT_DAILY_GOAL.toString());
  const [consumedCalories, setConsumedCalories] = useState<number>(0);
  const [consumedMacros, setConsumedMacros] = useState<MacroData>({ carbs: 0, protein: 0, fat: 0 });
  const [selectedProfile, setSelectedProfile] = useState<ProfileType>('General');
  const [mealInput, setMealInput] = useState<string>('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [calorieHistory, setCalorieHistory] = useState<DailyHistoryEntry[]>([]); // State for history
  const [showHistory, setShowHistory] = useState<boolean>(false); // State to toggle history view
  const [expandedHistoryDate, setExpandedHistoryDate] = useState<string | null>(null);
  const [manualCalories, setManualCalories] = useState<string>(''); // New state for manual calorie input

  // Load data from localStorage on initial render and check for date change
  useEffect(() => {
    const storedDailyGoal = localStorage.getItem('dailyGoal');
    if (storedDailyGoal) {
      const goal = JSON.parse(storedDailyGoal);
      setDailyGoal(goal);
      setDailyGoalInput(goal.toString());
    }
    const storedProfile = localStorage.getItem('selectedProfile');
    if (storedProfile) {
      setSelectedProfile(JSON.parse(storedProfile) as ProfileType);
    }
    const storedCalories = localStorage.getItem('consumedCalories');
    if (storedCalories) setConsumedCalories(JSON.parse(storedCalories));
    const storedMacros = localStorage.getItem('consumedMacros');
    if (storedMacros) setConsumedMacros(JSON.parse(storedMacros));
    const storedLog = localStorage.getItem('calorieLog');
    if (storedLog) {
      const parsedLog = JSON.parse(storedLog);
      // Migrate old entries that might not have macro data
      const migratedLog = parsedLog.map((entry: any) => ({
        ...entry,
        macros: entry.macros || { carbs: 0, protein: 0, fat: 0 }
      }));
      setLog(migratedLog);
    }
    const storedHistory = localStorage.getItem('calorieHistory');
    if (storedHistory) {
      const parsedHistory = JSON.parse(storedHistory);
      // Migrate old history entries that might not have macro data
      const migratedHistory = parsedHistory.map((day: any) => ({
        ...day,
        mealLog: day.mealLog.map((entry: any) => ({
          ...entry,
          macros: entry.macros || { carbs: 0, protein: 0, fat: 0 }
        }))
      }));
      setCalorieHistory(migratedHistory);
    }

    // --- Updated: Date check using Luxon ---
    const getFormattedDate = (date: DateTime): string => date.toFormat('yyyy-MM-dd');
    const today = DateTime.now();
    const todayStr = getFormattedDate(today);
    
    const lastLog = storedLog ? JSON.parse(storedLog) : [];
    // Find the most recent non-reset log entry
    const lastEntry = lastLog.find((entry: any) => entry.text !== 'Daily Reset for new day');
    let lastEntryDate = null;
    if (lastEntry) {
      lastEntryDate = getFormattedDate(DateTime.fromMillis(lastEntry.timestamp));
    }
    // If there are no entries, or the last entry is from a previous day, trigger a reset
    if (lastEntryDate && lastEntryDate !== todayStr) {
      // Save yesterday's log to history
      const storedCaloriesNum = storedCalories ? JSON.parse(storedCalories) : 0;
      const storedDailyGoalNum = storedDailyGoal ? JSON.parse(storedDailyGoal) : dailyGoal;
      const newHistoryEntry = {
        date: lastEntryDate,
        totalCalories: storedCaloriesNum,
        mealLog: lastLog.filter((entry: any) => entry.text !== 'Daily Reset for new day'),
        dailyGoalAtTheTime: storedDailyGoalNum,
      };
      const prevHistory = storedHistory ? JSON.parse(storedHistory) : [];
      const filteredHistory = prevHistory.filter((entry: any) => entry.date !== lastEntryDate);
      const updatedHistory = [newHistoryEntry, ...filteredHistory].sort((a, b) => 
        DateTime.fromFormat(b.date, 'yyyy-MM-dd').toMillis() - DateTime.fromFormat(a.date, 'yyyy-MM-dd').toMillis()
      );
      setCalorieHistory(updatedHistory);
      localStorage.setItem('calorieHistory', JSON.stringify(updatedHistory));
      // Reset log and calories for today
      setConsumedCalories(0);
      setConsumedMacros({ carbs: 0, protein: 0, fat: 0 });
      setLog([
        {
          id: DateTime.now().toMillis().toString(),
          text: 'Daily Reset for new day',
          calories: 0,
          macros: { carbs: 0, protein: 0, fat: 0 },
          timestamp: DateTime.now().toMillis(),
        },
      ]);
      localStorage.setItem('consumedCalories', '0');
      localStorage.setItem('consumedMacros', JSON.stringify({ carbs: 0, protein: 0, fat: 0 }));
      localStorage.setItem('calorieLog', JSON.stringify([
        {
          id: DateTime.now().toMillis().toString(),
          text: 'Daily Reset for new day',
          calories: 0,
          timestamp: DateTime.now().toMillis(),
        },
      ]));
    }
  }, []);

  // Save data to localStorage whenever states change
  useEffect(() => {
    localStorage.setItem('dailyGoal', JSON.stringify(dailyGoal));
  }, [dailyGoal]);

  useEffect(() => {
    localStorage.setItem('selectedProfile', JSON.stringify(selectedProfile));
  }, [selectedProfile]);

  useEffect(() => {
    localStorage.setItem('consumedCalories', JSON.stringify(consumedCalories));
  }, [consumedCalories]);

  useEffect(() => {
    localStorage.setItem('consumedMacros', JSON.stringify(consumedMacros));
  }, [consumedMacros]);

  useEffect(() => {
    localStorage.setItem('calorieLog', JSON.stringify(log));
  }, [log]);

  useEffect(() => {
    localStorage.setItem('calorieHistory', JSON.stringify(calorieHistory));
  }, [calorieHistory]);

  // Reset at midnight and save daily summary
  useEffect(() => {
    const getFormattedDate = (date: DateTime): string => {
      return date.toFormat('yyyy-MM-dd');
    };

    const checkMidnight = () => {
      const now = DateTime.now();
      const tomorrow = now.plus({ days: 1 }).startOf('day');
      const timeToMidnight = tomorrow.toMillis() - now.toMillis();

      const timerId = setTimeout(() => {
        // Save the current day's summary before resetting
        const todayStr = getFormattedDate(now);
        // Avoid saving if no calories were consumed or if a summary for today already exists
        if (consumedCalories > 0 || log.length > 0) {
          const newHistoryEntry: DailyHistoryEntry = {
            date: todayStr,
            totalCalories: consumedCalories,
            mealLog: log,
            dailyGoalAtTheTime: dailyGoal,
          };

          setCalorieHistory(prevHistory => {
            // Filter out any existing entry for the same date to prevent duplicates
            const filteredHistory = prevHistory.filter(entry => entry.date !== todayStr);
            return [newHistoryEntry, ...filteredHistory].sort((a, b) => 
              DateTime.fromFormat(b.date, 'yyyy-MM-dd').toMillis() - DateTime.fromFormat(a.date, 'yyyy-MM-dd').toMillis()
            );
          });
        }
        
        // Reset for the new day
        setConsumedCalories(0);
        setConsumedMacros({ carbs: 0, protein: 0, fat: 0 });
        setLog([
          {
            id: DateTime.now().toMillis().toString(),
            text: 'Daily Reset for new day',
            calories: 0,
            macros: { carbs: 0, protein: 0, fat: 0 },
            timestamp: DateTime.now().toMillis(),
          },
        ]);
        
        checkMidnight(); // Schedule the next check
      }, timeToMidnight);

      return () => clearTimeout(timerId);
    };

    const clearTimer = checkMidnight();
    return clearTimer;
  }, [consumedCalories, log, dailyGoal]);

  const parseNutritionFromResponse = (responseText: string): { calories: number; macros: MacroData } | null => {
    console.log('OpenAI Response for parsing:', responseText);
    try {
      // Try to parse as JSON first
      const jsonData = JSON.parse(responseText.trim());
      if (jsonData.calories !== undefined && jsonData.carbs !== undefined && 
          jsonData.protein !== undefined && jsonData.fat !== undefined) {
        return {
          calories: parseInt(jsonData.calories) || 0,
          macros: {
            carbs: parseInt(jsonData.carbs) || 0,
            protein: parseInt(jsonData.protein) || 0,
            fat: parseInt(jsonData.fat) || 0
          }
        };
      }
    } catch (e) {
      // Fallback for old format - just calories
      const specificPattern = /(\d+)\s*(?:calories|kcal)/i;
      const specificMatch = responseText.match(specificPattern);
      if (specificMatch && specificMatch[1]) {
        const calories = parseInt(specificMatch[1], 10);
        return {
          calories,
          macros: { carbs: 0, protein: 0, fat: 0 } // Default to 0 if no macro data
        };
      }
      const generalNumberPattern = /\b(\d+)\b/;
      const generalMatch = responseText.match(generalNumberPattern);
      if (generalMatch && generalMatch[1]) {
        const potentialCalories = parseInt(generalMatch[1], 10);
        if (potentialCalories > 0 && potentialCalories < 5000) {
          return {
            calories: potentialCalories,
            macros: { carbs: 0, protein: 0, fat: 0 }
          };
        }
      }
    }
    console.warn('Could not parse nutrition data from response:', responseText);
    return null;
  };

  const handleMealSubmit = async (text: string, imageBase64?: string) => {
    if (!OPENAI_API_KEY && !manualCalories) {
      setError(
        'OpenAI API key is not configured. Please set NEXT_PUBLIC_OPENAI_KEY in your .env.local file.'
      );
      setIsLoading(false);
      return;
    }
    if (!text && !imageBase64) return;
    setIsLoading(true);
    setError(null);

    // If user provided calories, use them directly
    if (manualCalories.trim() !== '' && !isNaN(Number(manualCalories))) {
      const caloriesNum = Math.max(0, Math.round(Number(manualCalories)));
      let entryText = text.trim();
      if (imageBase64 && !entryText) {
        setIsLoading(true);
        const imageDescription = await generateMealDescriptionFromImage(imageBase64);
        if (imageDescription) {
          entryText = imageDescription;
        } else {
          entryText = 'Meal from image';
        }
      }
      const newEntry: LogEntry = {
        id: DateTime.now().toMillis().toString(),
        text: entryText || (imageBase64 ? 'Meal from image' : 'Logged Meal'),
        calories: caloriesNum,
        macros: { carbs: 0, protein: 0, fat: 0 }, // Manual entries default to 0 macros
        timestamp: DateTime.now().toMillis(),
      };
      setLog(prevLog => [newEntry, ...prevLog]);
      setConsumedCalories(prev => prev + caloriesNum);
      // Manual entries don't have macro data, so no macro update needed
      setIsLoading(false);
      setMealInput('');
      setManualCalories('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    let promptContent: OpenAIPromptContent[] = [];
    const systemMessage = "You are a nutrition estimation assistant. Your task is to estimate the calories and macros (carbohydrates, protein, fat) in the provided meal description or image. Respond with ONLY a JSON object in this exact format: {\"calories\": 350, \"carbs\": 45, \"protein\": 25, \"fat\": 8}. The numbers should represent grams for macros and total calories. If you cannot estimate, respond with {\"calories\": 0, \"carbs\": 0, \"protein\": 0, \"fat\": 0}.";
    if (text) {
      promptContent.push({ type: 'text', text: `Meal: ${text}` });
    }
    if (imageBase64) {
      promptContent.push({
        type: 'image_url',
        image_url: { url: imageBase64 },
      });
      if (!text) {
        promptContent.unshift({ type: 'text', text: "Estimate calories for the following image:"});
      }
    }
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemMessage },
            {
              role: 'user',
              content: promptContent,
            },
          ],
          max_tokens: 50, 
          temperature: 0.2,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to fetch calorie estimate');
      }
      const data = await response.json();
      const choice = data.choices?.[0]?.message?.content;
      if (choice) {
        const nutritionData = parseNutritionFromResponse(choice);
        if (nutritionData !== null) {
          let entryText = text.trim();
          if (imageBase64 && !entryText) {
            setIsLoading(true); 
            const imageDescription = await generateMealDescriptionFromImage(imageBase64);
            if (imageDescription) {
              entryText = imageDescription;
            } else {
              entryText = 'Meal from image';
            }
          }
          const newEntry: LogEntry = {
            id: DateTime.now().toMillis().toString(),
            text: entryText || (imageBase64 ? 'Meal from image' : 'Logged Meal'),
            calories: nutritionData.calories,
            macros: nutritionData.macros,
            timestamp: DateTime.now().toMillis(),
          };
          setLog(prevLog => [newEntry, ...prevLog]);
          setConsumedCalories(prev => prev + nutritionData.calories);
          setConsumedMacros(prev => ({
            carbs: prev.carbs + nutritionData.macros.carbs,
            protein: prev.protein + nutritionData.macros.protein,
            fat: prev.fat + nutritionData.macros.fat,
          }));
        } else {
          setError('Could not parse calorie estimate from response: ' + choice);
        }
      } else {
        setError('No response content from OpenAI.');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
    setIsLoading(false);
    setMealInput('');
    setManualCalories('');
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mealInput.trim()) {
      handleMealSubmit(mealInput.trim());
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setIsLoading(true);
        const base64String = await resizeImage(file, 512); // Resize before sending
        handleMealSubmit(mealInput.trim(), base64String);
      } catch (err) {
        setError('Failed to process image.');
        setIsLoading(false);
      }
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDailyGoalChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDailyGoalInput(inputValue);
    
    if (inputValue === '') {
      // Allow empty input temporarily, but keep current goal
      return;
    }
    
    const newGoal = parseInt(inputValue, 10);
    if (!isNaN(newGoal) && newGoal > 0) {
      setDailyGoal(newGoal);
    }
  };

  const handleDailyGoalBlur = () => {
    if (dailyGoalInput === '' || parseInt(dailyGoalInput, 10) <= 0 || isNaN(parseInt(dailyGoalInput, 10))) {
      setDailyGoalInput(dailyGoal.toString());
    }
  };

  const handleDeleteLogEntry = (entryId: string) => {
    const entryToDelete = log.find(entry => entry.id === entryId);
    if (entryToDelete) {
      setConsumedCalories(prevCalories => prevCalories - entryToDelete.calories);
      setConsumedMacros(prev => ({
        carbs: prev.carbs - entryToDelete.macros.carbs,
        protein: prev.protein - entryToDelete.macros.protein,
        fat: prev.fat - entryToDelete.macros.fat,
      }));
      setLog(prevLog => prevLog.filter(entry => entry.id !== entryId));
    }
  };

  const handleDuplicateLogEntry = (entryId: string) => {
    const entryToDuplicate = log.find(entry => entry.id === entryId);
    if (entryToDuplicate) {
      const newEntry: LogEntry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        text: entryToDuplicate.text,
        calories: entryToDuplicate.calories,
        macros: entryToDuplicate.macros,
        timestamp: Date.now(),
      };
      setLog(prevLog => [...prevLog, newEntry]);
      setConsumedCalories(prevCalories => prevCalories + newEntry.calories);
      setConsumedMacros(prev => ({
        carbs: prev.carbs + newEntry.macros.carbs,
        protein: prev.protein + newEntry.macros.protein,
        fat: prev.fat + newEntry.macros.fat,
      }));
    }
  };

  const handleDuplicateFromHistory = (entry: LogEntry) => {
    const newEntry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text: entry.text,
      calories: entry.calories,
      macros: entry.macros,
      timestamp: Date.now(),
    };
    setLog(prevLog => [...prevLog, newEntry]);
    setConsumedCalories(prevCalories => prevCalories + newEntry.calories);
    setConsumedMacros(prev => ({
      carbs: prev.carbs + newEntry.macros.carbs,
      protein: prev.protein + newEntry.macros.protein,
      fat: prev.fat + newEntry.macros.fat,
    }));
  };

  const progressPercentage = Math.min((consumedCalories / dailyGoal) * 100, 100);

  // Calculate macro percentages based on consumed calories
  const getMacroPercentages = () => {
    if (consumedCalories === 0) return { carbs: 0, protein: 0, fat: 0 };
    
    // Convert grams to calories (carbs: 4 cal/g, protein: 4 cal/g, fat: 9 cal/g)
    const carbCalories = consumedMacros.carbs * 4;
    const proteinCalories = consumedMacros.protein * 4;
    const fatCalories = consumedMacros.fat * 9;
    
    return {
      carbs: Math.round((carbCalories / consumedCalories) * 100),
      protein: Math.round((proteinCalories / consumedCalories) * 100),
      fat: Math.round((fatCalories / consumedCalories) * 100),
    };
  };

  const macroPercentages = getMacroPercentages();

  // Get the ideal macro percentages for the selected profile
  const getIdealMacroPercentages = () => PROFILE_MACRO_PERCENTAGES[selectedProfile];

  // Calculate total macros for a day's meals
  const getDayMacros = (mealLog: LogEntry[]): MacroData => {
    return mealLog.filter(entry => entry.text !== 'Daily Reset for new day').reduce(
      (totals, entry) => ({
        carbs: totals.carbs + entry.macros.carbs,
        protein: totals.protein + entry.macros.protein,
        fat: totals.fat + entry.macros.fat,
      }),
      { carbs: 0, protein: 0, fat: 0 }
    );
  };

  // Calculate macro percentages for a specific day
  const getDayMacroPercentages = (totalCalories: number, macros: MacroData) => {
    if (totalCalories === 0) return { carbs: 0, protein: 0, fat: 0 };
    
    const carbCalories = macros.carbs * 4;
    const proteinCalories = macros.protein * 4;
    const fatCalories = macros.fat * 9;
    
    return {
      carbs: Math.round((carbCalories / totalCalories) * 100),
      protein: Math.round((proteinCalories / totalCalories) * 100),
      fat: Math.round((fatCalories / totalCalories) * 100),
    };
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-10 max-w-md mx-auto">
      <header className="w-full mb-10 text-center">
        <h1 className="text-5xl font-bold text-cyan-700">Intake</h1>
        <div className="mt-4 flex items-center justify-center">
            <p className="text-slate-600 mr-2">Daily Goal:</p>
            <input 
                type="number"
                value={dailyGoalInput}
                onChange={handleDailyGoalChange}
                onBlur={handleDailyGoalBlur}
                className="w-24 p-2 border border-slate-300 rounded-lg text-center text-slate-700 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 shadow-sm text-sm"
                placeholder="kcal"
                min="1"
            />
             <p className="text-slate-600 ml-1.5">kcal</p>
        </div>
      </header>

      <div className="w-full mb-10">
        <div className="flex justify-between text-sm text-slate-600 mb-1.5">
          <span>{consumedCalories} kcal consumed</span>
          <span>{Math.max(0, dailyGoal - consumedCalories)} kcal remaining</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-5 shadow-inner overflow-hidden">
          <div
            className="bg-cyan-500 h-full rounded-full transition-all duration-500 ease-out text-xs font-medium text-white flex items-center justify-center"
            style={{ width: `${progressPercentage}%` }}
          >
            {progressPercentage > 5 ? `${progressPercentage.toFixed(0)}%` : ''}
          </div>
        </div>
      </div>

      <form onSubmit={handleTextSubmit} className="w-full mb-8 space-y-4">
        <textarea
          rows={3}
          className="w-full p-3 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none placeholder-slate-400 text-slate-700"
          placeholder="e.g., 'Chicken salad with avocado' or upload a photo..."
          value={mealInput}
          onChange={(e) => setMealInput(e.target.value)}
          disabled={isLoading}
        />
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()} 
                className="w-full sm:w-auto flex-grow justify-center items-center px-6 py-3 bg-sky-500 text-white font-semibold rounded-lg shadow-md hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-opacity-75 transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex"
                disabled={isLoading}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                Take Photo
            </button>
            <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                disabled={isLoading}
            />
            <button
                type="submit"
                className="w-full sm:w-auto flex-grow justify-center items-center px-6 py-3 bg-cyan-600 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-75 transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex"
                disabled={isLoading || (!mealInput.trim() && !fileInputRef.current?.files?.length)}
            >
                 {isLoading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                         <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                )}
                Add Meal
            </button>
        </div>
      </form>

      {/* Manual Calories Input */}
      <div className="w-full mb-6">
        <input
          type="number"
          min="0"
          step="1"
          className="w-full p-3 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-700 placeholder-slate-400"
          placeholder="Calories (optional, e.g. 350)"
          value={manualCalories}
          onChange={e => setManualCalories(e.target.value)}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="w-full p-3 mb-6 text-sm text-red-700 bg-red-100 rounded-lg border border-red-300 shadow" role="alert">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      {/* Macro Progress Display */}
      <div className="w-full mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-slate-700">Macros</h3>
          <span className="text-sm font-medium text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md">
            {selectedProfile}
          </span>
        </div>
        <div className="space-y-3">
          {/* Carbohydrates */}
          <div>
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Carbs ({consumedMacros.carbs}g)</span>
              <span>{macroPercentages.carbs}% (ideal: {getIdealMacroPercentages().carbs}%)</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 shadow-inner overflow-hidden">
              <div
                className="bg-green-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(macroPercentages.carbs, 100)}%` }}
              />
            </div>
          </div>
          
          {/* Protein */}
          <div>
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Protein ({consumedMacros.protein}g)</span>
              <span>{macroPercentages.protein}% (ideal: {getIdealMacroPercentages().protein}%)</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 shadow-inner overflow-hidden">
              <div
                className="bg-red-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(macroPercentages.protein, 100)}%` }}
              />
            </div>
          </div>
          
          {/* Fat */}
          <div>
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Fat ({consumedMacros.fat}g)</span>
              <span>{macroPercentages.fat}% (ideal: {getIdealMacroPercentages().fat}%)</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 shadow-inner overflow-hidden">
              <div
                className="bg-yellow-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(macroPercentages.fat, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full mb-10">
        <h2 className="text-3xl font-semibold text-slate-700 mb-5">Today&apos;s Log</h2>
        {log.length === 0 || log.every(entry => entry.text === 'Daily Reset for new day') && !isLoading ? (
          <p className="text-slate-500 text-center py-6">No meals logged yet for today.</p>
        ) : (
          <ul className="space-y-3.5">
            {log.filter(entry => entry.text !== 'Daily Reset for new day').map((entry) => (
              <li key={entry.id} className="p-4 bg-white rounded-xl shadow-lg transition-shadow hover:shadow-xl">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-grow mr-3">
                    <p className="font-medium text-slate-800 text-lg">{entry.text}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-lg text-cyan-600">{entry.calories} kcal</span>
                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => handleDuplicateLogEntry(entry.id)}
                        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-full transition-colors duration-150"
                        aria-label="Duplicate meal entry"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => handleDeleteLogEntry(entry.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors duration-150"
                        aria-label="Delete meal entry"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                                {/* Macro information */}
                {(entry.macros.carbs > 0 || entry.macros.protein > 0 || entry.macros.fat > 0) && (
                  <div className="flex justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
                    <span>C: {entry.macros.carbs}g ({Math.round((entry.macros.carbs * 4 / entry.calories) * 100)}%)</span>
                    <span>P: {entry.macros.protein}g ({Math.round((entry.macros.protein * 4 / entry.calories) * 100)}%)</span>
                    <span>F: {entry.macros.fat}g ({Math.round((entry.macros.fat * 9 / entry.calories) * 100)}%)</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
         {isLoading && log.length === 0 && (
            <p className="text-slate-500 text-center py-4">Loading first entry...</p>
        )}
      </div>

      <div className="w-full">
        <button 
          onClick={() => setShowHistory(!showHistory)}
          className="w-full mb-5 px-4 py-2.5 bg-slate-200 text-slate-700 font-semibold rounded-lg shadow hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 transition duration-150 flex justify-between items-center"
        >
          <span>{showHistory ? 'Hide' : 'Show'} Calorie History</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-300 ${showHistory ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {showHistory && (
          <div className="space-y-6">
            {calorieHistory.length === 0 ? (
              <p className="text-slate-500 text-center py-4">No history recorded yet.</p>
            ) : (
              <>
                <CalorieHistoryGraph history={calorieHistory} />
                {calorieHistory.map((day) => {
                  const dayMacros = getDayMacros(day.mealLog);
                  const dayMacroPercentages = getDayMacroPercentages(day.totalCalories, dayMacros);
                  
                  return (
                  <div key={day.date} className="p-5 bg-white rounded-xl shadow-lg">
                    <div 
                      className="flex justify-between items-center cursor-pointer" 
                      onClick={() => setExpandedHistoryDate(expandedHistoryDate === day.date ? null : day.date)}
                    >
                      <div>
                        <h3 className="text-xl font-semibold text-cyan-700">{new Date(day.date + 'T00:00:00').toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                        <p className="text-sm text-slate-600">Total: {day.totalCalories} kcal (Goal: {day.dailyGoalAtTheTime} kcal)</p>
                        {(dayMacros.carbs > 0 || dayMacros.protein > 0 || dayMacros.fat > 0) && (
                          <p className="text-xs text-slate-500 mt-1">
                            Macros: C: {dayMacroPercentages.carbs}% ({dayMacros.carbs}g) • P: {dayMacroPercentages.protein}% ({dayMacros.protein}g) • F: {dayMacroPercentages.fat}% ({dayMacros.fat}g)
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">Ideal: C: {getIdealMacroPercentages().carbs}% • P: {getIdealMacroPercentages().protein}% • F: {getIdealMacroPercentages().fat}%</p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-300 ${expandedHistoryDate === day.date ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                    {expandedHistoryDate === day.date && (
                      <ul className="mt-4 space-y-2.5 pl-2 border-l-2 border-slate-200 ml-1">
                        {day.mealLog.filter(entry => entry.text !== 'Daily Reset for new day').map((entry) => (
                          <li key={entry.id} className="p-2.5 bg-slate-50 rounded-lg shadow-sm text-sm">
                            <div className="flex justify-between items-center">
                              <div className="flex-grow">
                                <p className="font-medium text-slate-700">{entry.text}</p>
                                <p className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-cyan-600">{entry.calories} kcal</span>
                                <button 
                                  onClick={() => handleDuplicateFromHistory(entry)}
                                  className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-full transition-colors duration-150"
                                  aria-label="Duplicate meal entry to today"
                                  title="Add to today's log"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            {/* Macro information for history entries */}
                            {(entry.macros.carbs > 0 || entry.macros.protein > 0 || entry.macros.fat > 0) && (
                              <div className="flex justify-between text-xs text-slate-400 mt-1 pt-1 border-t border-slate-200">
                                <span>C: {entry.macros.carbs}g ({Math.round((entry.macros.carbs * 4 / entry.calories) * 100)}%)</span>
                                <span>P: {entry.macros.protein}g ({Math.round((entry.macros.protein * 4 / entry.calories) * 100)}%)</span>
                                <span>F: {entry.macros.fat}g ({Math.round((entry.macros.fat * 9 / entry.calories) * 100)}%)</span>
                              </div>
                            )}
                          </li>
                        ))}
                        {day.mealLog.filter(entry => entry.text !== 'Daily Reset for new day').length === 0 && (
                          <li className="text-slate-400 text-xs italic">No meals logged for this day.</li>
                        )}
                      </ul>
                    )}
                  </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Macro Profile Selection */}
      <div className="w-full mb-10">
        <h3 className="text-lg font-semibold text-slate-700 mb-3">Macro Profile</h3>
        <p className="text-sm text-slate-600 mb-4">Choose your nutrition goal to adjust ideal macro percentages:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(PROFILE_MACRO_PERCENTAGES) as ProfileType[]).map((profile) => {
            const macros = PROFILE_MACRO_PERCENTAGES[profile];
            return (
              <button
                key={profile}
                onClick={() => setSelectedProfile(profile)}
                className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                  selectedProfile === profile
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-base mb-1">{profile}</div>
                <div className="text-xs text-slate-500">
                  C: {macros.carbs}% • P: {macros.protein}% • F: {macros.fat}%
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {profile === 'General' && 'Balanced nutrition for overall health'}
                  {profile === 'Weight Loss' && 'Higher protein, lower carbs'}
                  {profile === 'Muscle Building' && 'High protein for muscle growth'}
                  {profile === 'Endurance Athletes' && 'High carbs for sustained energy'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <footer className="w-full mt-16 text-center text-slate-500 text-xs">
        <p>Intake &copy; {new Date().getFullYear()}</p>
        <p className="mt-1">Remember to set your <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md text-xs">NEXT_PUBLIC_OPENAI_KEY</code> environment variable.</p>
        <p className="mt-3 text-xs italic text-slate-400">
          Disclaimer: Our AI tries its best, but sometimes it thinks a salad is a cheeseburger. Calorie estimates may be wildly optimistic, pessimistic, or just plain confused. For actual health advice, consult a real human (preferably one with a degree, not just a strong opinion about kale).
        </p>
      </footer>
    </div>
  );
} 