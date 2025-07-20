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

interface LogEntry {
  id: string;
  text: string;
  calories: number;
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
    const storedCalories = localStorage.getItem('consumedCalories');
    if (storedCalories) setConsumedCalories(JSON.parse(storedCalories));
    const storedLog = localStorage.getItem('calorieLog');
    if (storedLog) setLog(JSON.parse(storedLog));
    const storedHistory = localStorage.getItem('calorieHistory');
    if (storedHistory) setCalorieHistory(JSON.parse(storedHistory));

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
      setLog([
        {
          id: DateTime.now().toMillis().toString(),
          text: 'Daily Reset for new day',
          calories: 0,
          timestamp: DateTime.now().toMillis(),
        },
      ]);
      localStorage.setItem('consumedCalories', '0');
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
    localStorage.setItem('consumedCalories', JSON.stringify(consumedCalories));
  }, [consumedCalories]);

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
        setLog([
          {
            id: DateTime.now().toMillis().toString(),
            text: 'Daily Reset for new day',
            calories: 0,
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

  const parseCaloriesFromResponse = (responseText: string): number | null => {
    console.log('OpenAI Response for parsing:', responseText);
    const specificPattern = /(\d+)\s*(?:calories|kcal)/i;
    const specificMatch = responseText.match(specificPattern);
    if (specificMatch && specificMatch[1]) {
      return parseInt(specificMatch[1], 10);
    }
    const generalNumberPattern = /\b(\d+)\b/;
    const generalMatch = responseText.match(generalNumberPattern);
    if (generalMatch && generalMatch[1]) {
      const potentialCalories = parseInt(generalMatch[1], 10);
      if (potentialCalories > 0 && potentialCalories < 5000) {
        return potentialCalories;
      }
    }
    const anyDigitsPattern = /(\d+)/;
    const anyDigitsMatch = responseText.match(anyDigitsPattern);
    if (anyDigitsMatch && anyDigitsMatch[1]) {
        const potentialCalories = parseInt(anyDigitsMatch[1], 10);
        if (potentialCalories > 0 && potentialCalories < 5000) {
            return potentialCalories;
        }
    }
    console.warn('Could not parse a calorie number from response:', responseText);
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
        timestamp: DateTime.now().toMillis(),
      };
      setLog(prevLog => [newEntry, ...prevLog]);
      setConsumedCalories(prev => prev + caloriesNum);
      setIsLoading(false);
      setMealInput('');
      setManualCalories('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    let promptContent: OpenAIPromptContent[] = [];
    const systemMessage = "You are a calorie estimation assistant. Your task is to estimate the calories in the provided meal description or image. Respond with ONLY the numerical value of the estimated calories. For example, if you estimate 350 calories, respond with '350'. Do not include units like 'calories' or 'kcal' or any other descriptive text. If you cannot estimate, respond with '0'.";
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
          max_tokens: 15, 
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
        const estimatedCalories = parseCaloriesFromResponse(choice);
        if (estimatedCalories !== null) {
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
            calories: estimatedCalories,
            timestamp: DateTime.now().toMillis(),
          };
          setLog(prevLog => [newEntry, ...prevLog]);
          setConsumedCalories(prev => prev + estimatedCalories);
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
        timestamp: Date.now(),
      };
      setLog(prevLog => [...prevLog, newEntry]);
      setConsumedCalories(prevCalories => prevCalories + newEntry.calories);
    }
  };

  const handleDuplicateFromHistory = (entry: LogEntry) => {
    const newEntry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text: entry.text,
      calories: entry.calories,
      timestamp: Date.now(),
    };
    setLog(prevLog => [...prevLog, newEntry]);
    setConsumedCalories(prevCalories => prevCalories + newEntry.calories);
  };

  const progressPercentage = Math.min((consumedCalories / dailyGoal) * 100, 100);

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

      {error && (
        <div className="w-full p-3 mb-6 text-sm text-red-700 bg-red-100 rounded-lg border border-red-300 shadow" role="alert">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      <div className="w-full mb-10">
        <h2 className="text-3xl font-semibold text-slate-700 mb-5">Today&apos;s Log</h2>
        {log.length === 0 || log.every(entry => entry.text === 'Daily Reset for new day') && !isLoading ? (
          <p className="text-slate-500 text-center py-6">No meals logged yet for today.</p>
        ) : (
          <ul className="space-y-3.5">
            {log.filter(entry => entry.text !== 'Daily Reset for new day').map((entry) => (
              <li key={entry.id} className="p-4 bg-white rounded-xl shadow-lg flex justify-between items-center transition-shadow hover:shadow-xl">
                <div className="flex-grow mr-3">
                  <p className="font-medium text-slate-800 text-lg">{entry.text}</p>
                  <p className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className="font-semibold text-lg text-cyan-600 mr-3">{entry.calories} kcal</span>
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
                {calorieHistory.map((day) => (
                  <div key={day.date} className="p-5 bg-white rounded-xl shadow-lg">
                    <div 
                      className="flex justify-between items-center cursor-pointer" 
                      onClick={() => setExpandedHistoryDate(expandedHistoryDate === day.date ? null : day.date)}
                    >
                      <div>
                        <h3 className="text-xl font-semibold text-cyan-700">{new Date(day.date + 'T00:00:00').toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                        <p className="text-sm text-slate-600">Total: {day.totalCalories} kcal (Goal: {day.dailyGoalAtTheTime} kcal)</p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform duration-300 ${expandedHistoryDate === day.date ? 'rotate-180' : ''}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                    {expandedHistoryDate === day.date && (
                      <ul className="mt-4 space-y-2.5 pl-2 border-l-2 border-slate-200 ml-1">
                        {day.mealLog.filter(entry => entry.text !== 'Daily Reset for new day').map((entry) => (
                          <li key={entry.id} className="p-2.5 bg-slate-50 rounded-lg shadow-sm flex justify-between items-center text-sm">
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
                          </li>
                        ))}
                        {day.mealLog.filter(entry => entry.text !== 'Daily Reset for new day').length === 0 && (
                          <li className="text-slate-400 text-xs italic">No meals logged for this day.</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
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