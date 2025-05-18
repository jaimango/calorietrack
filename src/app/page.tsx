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
  ChartOptions
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
  timestamp: string; // Changed from number to string to store ISO format
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
  const [consumedCalories, setConsumedCalories] = useState<number>(0);
  const [mealInput, setMealInput] = useState<string>('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [calorieHistory, setCalorieHistory] = useState<DailyHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [expandedHistoryDate, setExpandedHistoryDate] = useState<string | null>(null);
  const [manualCalories, setManualCalories] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add function to check if date has changed
  const checkDateChange = (lastSavedDate: string) => {
    const today = DateTime.now().toISODate();
    return today !== lastSavedDate;
  };

  // Add function to get calories (placeholder for your existing calorie calculation logic)
  const getCalories = async (mealInput: string): Promise<number> => {
    // This should be replaced with your actual calorie calculation logic
    return 0;
  };

  // Modify loadData to handle date change
  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/calories');
      if (!response.ok) {
        throw new Error('Failed to load data');
      }
      const data = await response.json();
      
      // Check if date has changed
      if (data.lastSavedDate && checkDateChange(data.lastSavedDate)) {
        // Reset calories for new day
        setConsumedCalories(0);
        setLog([]);
        // Save the reset state
        await fetch('/api/calories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consumedCalories: 0,
            log: [],
            lastSavedDate: DateTime.now().toISODate()
          })
        });
      } else {
        setConsumedCalories(data.consumedCalories || 0);
        setLog(data.log || []);
      }
      
      setDailyGoal(data.dailyGoal || DEFAULT_DAILY_GOAL);
      setCalorieHistory(data.calorieHistory || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  // Modify saveData to include lastSavedDate
  const saveData = async (newConsumedCalories: number, newLog: LogEntry[]) => {
    try {
      const response = await fetch('/api/calories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumedCalories: newConsumedCalories,
          log: newLog,
          dailyGoal,
          lastSavedDate: DateTime.now().toISODate()
        })
      });
      if (!response.ok) {
        throw new Error('Failed to save data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save data');
    }
  };

  // Add handleDailyGoalChange
  const handleDailyGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newGoal = parseInt(e.target.value, 10);
    if (!isNaN(newGoal) && newGoal > 0) {
      setDailyGoal(newGoal);
    } else if (e.target.value === '') {
      setDailyGoal(DEFAULT_DAILY_GOAL);
    }
  };

  // Add handleDeleteLogEntry
  const handleDeleteLogEntry = (entryId: string) => {
    const entryToDelete = log.find(entry => entry.id === entryId);
    if (entryToDelete) {
      setConsumedCalories(prevCalories => prevCalories - entryToDelete.calories);
      setLog(prevLog => prevLog.filter(entry => entry.id !== entryId));
    }
  };

  // Add handleImageUpload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setIsLoading(true);
        const base64String = await resizeImage(file, 512);
        // Handle the image upload logic here
        setIsLoading(false);
      } catch (err) {
        setError('Failed to process image.');
        setIsLoading(false);
      }
    }
  };

  // Calculate progress percentage
  const progressPercentage = Math.min((consumedCalories / dailyGoal) * 100, 100);

  // Add handleTextSubmit
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealInput.trim() && !manualCalories.trim()) return;

    const calories = manualCalories.trim() 
      ? parseInt(manualCalories, 10)
      : await getCalories(mealInput);

    if (isNaN(calories)) {
      setError('Failed to get calories. Please try again.');
      return;
    }

    const newConsumedCalories = consumedCalories + calories;
    const newLog = [...log, {
      id: Date.now().toString(),
      text: mealInput.trim() || `Manual entry: ${calories} calories`,
      calories,
      timestamp: DateTime.now().toISO()
    }];

    setConsumedCalories(newConsumedCalories);
    setLog(newLog);
    setMealInput('');
    setManualCalories('');
    setError(null);

    await saveData(newConsumedCalories, newLog);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-10 max-w-md mx-auto">
      <header className="w-full mb-10 text-center">
        <h1 className="text-5xl font-bold text-cyan-700">Calorie<span className="font-light">Track</span></h1>
        <div className="mt-4 flex items-center justify-center">
            <p className="text-slate-600 mr-2">Daily Goal:</p>
            <input 
                type="number"
                value={dailyGoal.toString()}
                onChange={handleDailyGoalChange}
                className="w-24 p-2 border border-slate-300 rounded-lg text-center text-slate-700 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 shadow-sm text-sm"
                placeholder="kcal"
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
                         <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
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
                <button 
                  onClick={() => handleDeleteLogEntry(entry.id)}
                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors duration-150"
                  aria-label="Delete meal entry"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
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
                        <h3 className="text-xl font-semibold text-cyan-700">
                          {DateTime.fromISO(day.date).toLocaleString(DateTime.DATE_FULL)}
                        </h3>
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
                            <div>
                              <p className="font-medium text-slate-700">{entry.text}</p>
                              <p className="text-xs text-slate-500">
                                {DateTime.fromISO(entry.timestamp).toLocaleString(DateTime.TIME_SIMPLE)}
                              </p>
                            </div>
                            <span className="font-medium text-cyan-600">{entry.calories} kcal</span>
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
        <p>CalorieTrack &copy; {new Date().getFullYear()}</p>
        <p className="mt-1">Remember to set your <code className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md text-xs">NEXT_PUBLIC_OPENAI_KEY</code> environment variable.</p>
        <p className="mt-3 text-xs italic text-slate-400">
          Disclaimer: Our AI tries its best, but sometimes it thinks a salad is a cheeseburger. Calorie estimates may be wildly optimistic, pessimistic, or just plain confused. For actual health advice, consult a real human (preferably one with a degree, not just a strong opinion about kale).
        </p>
      </footer>
    </div>
  );
} 