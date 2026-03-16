
// Minimal state management with persistence-aware fields
const state = {
  user: null,
  prefs: null,
  plan: null,
  showImages: false,
  favorites: new Set(),
  savedMeals: null, // { timePeriod, prefs, plan } - saved meal plan for repeating
  suggestions: null, // { today: [...], week: { days: [{ meals: [...] }], totals } }
  mealHistory: [], // last 10 saved plans
};

// Simple router between pages
const pages = {
  auth: document.getElementById('page-auth'),
  preferences: document.getElementById('page-preferences'),
  plan: document.getElementById('page-plan'),
  shopping: document.getElementById('page-shopping'),
  database: document.getElementById('page-database'),
};

const logoutBtn = document.getElementById('logoutBtn');
const databaseBtn = document.getElementById('databaseBtn');
const editPrefsBtn = document.getElementById('editPrefsBtn');
const backToPrefsBtn = document.getElementById('backToPrefsBtn');
const toShoppingBtn = document.getElementById('toShoppingBtn');
const backToPlanBtn = document.getElementById('backToPlanBtn');
const downloadListBtn = document.getElementById('downloadListBtn');
const backToPlanFromDbBtn = document.getElementById('backToPlanFromDbBtn');
const editProfileBtn = document.getElementById('editProfileBtn');
const exportDataBtn = document.getElementById('exportDataBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');

// Arrow navigation buttons
const prefPrevArrowBtn = document.getElementById('prefPrevArrowBtn');
const prefNextArrowBtn = document.getElementById('prefNextArrowBtn');
const planPrevArrowBtn = document.getElementById('planPrevArrowBtn');
const planNextArrowBtn = document.getElementById('planNextArrowBtn');
const shopPrevArrowBtn = document.getElementById('shopPrevArrowBtn');

// Enhanced localStorage-backed DB with better security
const DB_KEY = 'forkcast_db_v2';
const HISTORY_KEY = 'forkcast_meal_history';
const SESSION_KEY = 'forkcast_session';

// Enhanced database structure
function dbLoad() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || {}; } catch { return {}; }
}
function dbSave(db) { 
  localStorage.setItem(DB_KEY, JSON.stringify(db)); 
  console.log('Database saved successfully');
}
function ensureDb() {
  const db = dbLoad();
  db.users = db.users || {};
  db.recipes = db.recipes || [];
  db.favorites = db.favorites || {}; // by email -> array
  db.preferences = db.preferences || {}; // by email
  db.plans = db.plans || {}; // by email
  db.suggestions = db.suggestions || {}; // by email
  db.savedMeals = db.savedMeals || {}; // by email -> { timePeriod, prefs, plan }
  db.userProfiles = db.userProfiles || {}; // by email -> profile data
  db.activityLog = db.activityLog || {}; // by email -> array of activities
  db.settings = db.settings || { theme: 'light', language: 'en' }; // global settings
  return db;
}

// Better password hashing
function hashish(s) { 
  return btoa(unescape(encodeURIComponent(s + 'forkast_salt_2024'))).split('').reverse().join(''); 
}

// Session management
function createSession(email, rememberMe = false) {
  const session = {
    email: email,
    createdAt: Date.now(),
    expiresAt: Date.now() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000) // 7 days or 24 hours
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!session || session.expiresAt < Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Enhanced user management
function saveUser(email, password, profile = {}) {
  const db = ensureDb();
  const timestamp = Date.now();
  
  db.users[email] = { 
    email, 
    pw: hashish(password),
    createdAt: timestamp,
    lastLogin: timestamp,
    isActive: true
  };
  
  // Initialize user profile
  db.userProfiles[email] = {
    displayName: profile.displayName || email.split('@')[0],
    avatar: profile.avatar || '',
    bio: profile.bio || '',
    joinDate: timestamp,
    ...profile
  };
  
  // Initialize activity log
  db.activityLog[email] = [{
    action: 'account_created',
    timestamp: timestamp,
    details: 'User account created'
  }];
  
  dbSave(db);
  console.log(`User ${email} saved successfully`);
}

function getUser(email) {
  const db = ensureDb();
  const user = db.users[email];
  if (user && !user.isActive) {
    return null; // Account deactivated
  }
  return user || null;
}

function updateUserProfile(email, profile) {
  const db = ensureDb();
  if (db.userProfiles[email]) {
    db.userProfiles[email] = { ...db.userProfiles[email], ...profile };
    dbSave(db);
    logActivity(email, 'profile_updated', 'User profile updated');
    return true;
  }
  return false;
}

function getUserProfile(email) {
  const db = ensureDb();
  return db.userProfiles[email] || null;
}

function logActivity(email, action, details = '') {
  const db = ensureDb();
  if (!db.activityLog[email]) {
    db.activityLog[email] = [];
  }
  db.activityLog[email].push({
    action,
    timestamp: Date.now(),
    details
  });
  // Keep only last 50 activities
  if (db.activityLog[email].length > 50) {
    db.activityLog[email] = db.activityLog[email].slice(-50);
  }
  dbSave(db);
}

function getUserActivity(email) {
  const db = ensureDb();
  return db.activityLog[email] || [];
}

function getAllUsers() {
  const db = ensureDb();
  return Object.keys(db.users).map(email => ({
    email,
    profile: db.userProfiles[email] || {},
    createdAt: db.users[email].createdAt,
    lastLogin: db.users[email].lastLogin,
    isActive: db.users[email].isActive
  }));
}

function deactivateUser(email) {
  const db = ensureDb();
  if (db.users[email]) {
    db.users[email].isActive = false;
    dbSave(db);
    logActivity(email, 'account_deactivated', 'Account deactivated');
    return true;
  }
  return false;
}

function changePassword(email, oldPassword, newPassword) {
  const db = ensureDb();
  const user = db.users[email];
  if (user && user.pw === hashish(oldPassword)) {
    user.pw = hashish(newPassword);
    user.lastPasswordChange = Date.now();
    dbSave(db);
    logActivity(email, 'password_changed', 'Password changed successfully');
    return true;
  }
  return false;
}
function savePrefs(email, prefs) {
  const db = ensureDb();
  db.preferences[email] = prefs;
  dbSave(db);
}
function loadPrefs(email) {
  const db = ensureDb();
  return db.preferences[email] || null;
}
function savePlan(email, plan) {
  const db = ensureDb();
  db.plans[email] = plan;
  dbSave(db);
}
function loadPlan(email) {
  const db = ensureDb();
  return db.plans[email] || null;
}
function saveFavorites(email, arr) {
  const db = ensureDb();
  db.favorites[email] = Array.from(new Set(arr));
  dbSave(db);
}
function loadFavorites(email) {
  const db = ensureDb();
  return new Set(db.favorites[email] || []);
}
function saveSuggestions(email, sugg) {
  const db = ensureDb();
  db.suggestions[email] = sugg;
  dbSave(db);
}
function loadSuggestions(email) {
  const db = ensureDb();
  return db.suggestions[email] || null;
}
function saveSavedMeals(email, savedData) {
  const db = ensureDb();
  db.savedMeals[email] = savedData;
  dbSave(db);
}
function loadSavedMeals(email) {
  const db = ensureDb();
  return db.savedMeals[email] || null;
}

function showPage(key) {
  Object.values(pages).forEach(p => p.classList.add('hidden'));
  pages[key].classList.remove('hidden');
  
  // Show/hide navigation buttons
  if (key === 'auth') {
    logoutBtn.classList.add('hidden');
    databaseBtn.classList.add('hidden');
  } else {
    logoutBtn.classList.remove('hidden');
    if (state.user && !state.user.guest) {
      databaseBtn.classList.remove('hidden');
    } else {
      databaseBtn.classList.add('hidden');
    }
  }
  
  // Load database page content when needed
  if (key === 'database') {
    loadDatabasePage();
  }
}

// Auth handlers with if/else validation
const loginForm = document.getElementById('loginForm');
const signupBtn = document.getElementById('signupBtn');
const guestBtn = document.getElementById('guestBtn');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const rememberMe = document.getElementById('rememberMe')?.checked || false;
  const err = (msg) => alert(msg);
  
  if (!email || !password) {
    err('Please enter both email and password.');
    return;
  }
  
  const u = getUser(email);
  if (!u) {
    // Auto-create account on first login to keep flow moving
    saveUser(email, password || Math.random().toString(36).slice(2,10));
    createSession(email, rememberMe);
    state.user = { email };
    state.favorites = loadFavorites(email);
    state.savedMeals = loadSavedMeals(email);
    logActivity(email, 'auto_login', 'Auto-created account and logged in');
    showPage('preferences');
    return;
  }
  
  if (u.pw !== hashish(password)) {
    err('Incorrect password.');
    logActivity(email, 'login_failed', 'Failed login attempt');
    return;
  }
  
  // Update last login and create session
  const db = ensureDb();
  db.users[email].lastLogin = Date.now();
  dbSave(db);
  
  createSession(email, rememberMe);
  state.user = { email };
  state.favorites = loadFavorites(email);
  logActivity(email, 'login_success', 'Successfully logged in');
  
  const savedPrefs = loadPrefs(email);
  if (savedPrefs) {
    state.prefs = savedPrefs;
    const plan = loadPlan(email);
    if (plan) {
      state.plan = plan;
      renderPlan(state.plan, state.prefs);
      showPage('plan');
    } else {
      showPage('preferences');
    }
  } else {
    showPage('preferences');
  }
});

signupBtn.addEventListener('click', () => {
  const emailRaw = document.getElementById('email').value.trim();
  const email = (emailRaw || 'guest@example.com').toLowerCase();
  const password = document.getElementById('password').value || Math.random().toString(36).slice(2,10);
  const u = getUser(email);
  
  if (u) {
    alert('Account already exists. Please log in.');
    return;
  }
  
  // Create user with basic profile
  saveUser(email, password, {
    displayName: email.split('@')[0],
    bio: 'Food enthusiast using Fork.cast'
  });
  
  createSession(email, false);
  state.user = { email };
  state.favorites = new Set();
  alert('Account created. You are now signed in.');
  logActivity(email, 'signup_success', 'Account created and logged in');
  showPage('preferences');
});

guestBtn.addEventListener('click', () => {
  state.user = { guest: true, email: 'guest@example.com' };
  state.favorites = new Set();
  showPage('preferences');
});

logoutBtn.addEventListener('click', () => {
  if (state.user && state.user.email) {
    logActivity(state.user.email, 'logout', 'User logged out');
  }
  clearSession();
  state.user = null;
  state.prefs = null;
  state.plan = null;
  state.favorites = new Set();
  state.savedMeals = null;
  state.suggestions = null;
  showPage('auth');
});

// Database navigation and event handlers
databaseBtn.addEventListener('click', () => showPage('database'));
backToPlanFromDbBtn.addEventListener('click', () => showPage('plan'));

// Database management functions
function loadDatabasePage() {
  if (!state.user || state.user.guest) {
    showPage('auth');
    return;
  }
  
  const email = state.user.email;
  
  // Load user profile
  const profile = getUserProfile(email);
  const profileHtml = profile ? `
    <p><strong>Name:</strong> ${profile.displayName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Member since:</strong> ${new Date(profile.joinDate).toLocaleDateString()}</p>
    <p><strong>Bio:</strong> ${profile.bio || 'No bio set'}</p>
  ` : '<p>No profile data found</p>';
  document.getElementById('userProfileInfo').innerHTML = profileHtml;
  
  // Load database statistics
  const db = ensureDb();
  const statsHtml = `
    <p><strong>Total Users:</strong> ${Object.keys(db.users).length}</p>
    <p><strong>Total Recipes:</strong> ${db.recipes.length}</p>
    <p><strong>Your Favorites:</strong> ${state.favorites.size}</p>
    <p><strong>Saved Plans:</strong> ${db.plans[email] ? 1 : 0}</p>
    <p><strong>Database Size:</strong> ${(JSON.stringify(db).length / 1024).toFixed(2)} KB</p>
  `;
  document.getElementById('dbStats').innerHTML = statsHtml;
  
  // Load activity log
  const activities = getUserActivity(email).slice(-10).reverse();
  const activityHtml = activities.length ? activities.map(activity => `
    <div class="activity-item">
      <strong>${activity.action}</strong> - ${new Date(activity.timestamp).toLocaleString()}
      <br><small>${activity.details}</small>
    </div>
  `).join('') : '<p>No recent activity</p>';
  document.getElementById('activityLog').innerHTML = activityHtml;
}

// Edit profile handler
editProfileBtn.addEventListener('click', () => {
  const email = state.user.email;
  const profile = getUserProfile(email);
  
  const newDisplayName = prompt('Display Name:', profile?.displayName || '');
  if (newDisplayName !== null) {
    const newBio = prompt('Bio:', profile?.bio || '');
    if (newBio !== null) {
      updateUserProfile(email, {
        displayName: newDisplayName,
        bio: newBio
      });
      alert('Profile updated successfully!');
      loadDatabasePage();
    }
  }
});

// Export data handler
exportDataBtn.addEventListener('click', () => {
  const email = state.user.email;
  const db = ensureDb();
  
  const userData = {
    profile: getUserProfile(email),
    preferences: loadPrefs(email),
    favorites: Array.from(loadFavorites(email)),
    plans: loadPlan(email),
    savedMeals: loadSavedMeals(email),
    activity: getUserActivity(email),
    exportDate: new Date().toISOString()
  };
  
  const dataStr = JSON.stringify(userData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `forkcast_data_${email}_${Date.now()}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
  logActivity(email, 'data_exported', 'User data exported');
  alert('Data exported successfully!');
});

// Clear cache handler
clearCacheBtn.addEventListener('click', () => {
  if (confirm('This will clear all cached data except your account. Continue?')) {
    const email = state.user.email;
    const db = ensureDb();
    
    // Keep user data but clear temporary data
    db.favorites[email] = [];
    db.plans[email] = null;
    db.suggestions[email] = null;
    db.savedMeals[email] = null;
    
    dbSave(db);
    
    // Clear current state
    state.favorites = new Set();
    state.prefs = null;
    state.plan = null;
    state.savedMeals = null;
    state.suggestions = null;
    
    logActivity(email, 'cache_cleared', 'User cache cleared');
    alert('Cache cleared successfully!');
    showPage('preferences');
  }
});

// Change password handler
resetPasswordBtn.addEventListener('click', () => {
  const email = state.user.email;
  const currentPassword = prompt('Enter current password:');
  
  if (currentPassword) {
    const newPassword = prompt('Enter new password:');
    if (newPassword && newPassword.length >= 6) {
      const confirmPassword = prompt('Confirm new password:');
      
      if (newPassword === confirmPassword) {
        if (changePassword(email, currentPassword, newPassword)) {
          alert('Password changed successfully!');
        } else {
          alert('Current password is incorrect.');
        }
      } else {
        alert('Passwords do not match.');
      }
    } else {
      alert('Password must be at least 6 characters long.');
    }
  }
});

// Check for existing session on page load
document.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  if (session) {
    const user = getUser(session.email);
    if (user) {
      state.user = { email: session.email };
      state.favorites = loadFavorites(session.email);
      const savedPrefs = loadPrefs(session.email);
      if (savedPrefs) {
        state.prefs = savedPrefs;
        const plan = loadPlan(session.email);
        if (plan) {
          state.plan = plan;
          renderPlan(state.plan, state.prefs);
          showPage('plan');
          return;
        }
      }
      showPage('preferences');
      return;
    }
  }
  showPage('auth');
});
if (prefNextArrowBtn) prefNextArrowBtn.addEventListener('click', () => {
  // trigger form submit for preferences without referencing undeclared var
  const form = document.getElementById('preferencesForm');
  if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
});
if (planPrevArrowBtn) planPrevArrowBtn.addEventListener('click', () => showPage('preferences'));
if (planNextArrowBtn) planNextArrowBtn.addEventListener('click', () => {
  renderShoppingListPage();
  showPage('shopping');
});
if (shopPrevArrowBtn) shopPrevArrowBtn.addEventListener('click', () => showPage('plan'));

// Preferences form handling
const preferencesForm = document.getElementById('preferencesForm');

preferencesForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const dietType = document.getElementById('dietType').value;
  const mealsPerDay = clampInt(parseInt(document.getElementById('mealsPerDay').value, 10), 1, 8);
  // Targets removed
  const targetCalories = undefined;
  const targetCarbs = undefined;
  const targetProtein = undefined;
  const targetFat = undefined;
  const allergies = toList(document.getElementById('allergies').value);
  const exclusions = toList(document.getElementById('exclusions').value);

  const timePeriod = (document.getElementById('timePeriod')?.value || 'today');
  const allToggle = document.getElementById('mtAll');
  const mtChecks = Array.from(document.querySelectorAll('#mealTypeGroup .mt'));
  let mealTypes = mtChecks.filter(c => c.checked).map(c => c.value);
  if (allToggle && allToggle.checked) mealTypes = ['breakfast','lunch','dinner','snack'];
  if (!mealTypes.length) {
    alert('Please select at least one meal type');
    return;
  }

  state.prefs = {
    dietType, mealsPerDay,
    targets: undefined,
    allergies, exclusions,
    timePeriod, mealTypes,
  };
  if (state.user && state.user.email) savePrefs(state.user.email, state.prefs);

  // Generate plan
  if (timePeriod === 'week') {
    startWeekTwoPhase(state.prefs);
  } else {
    state.plan = generatePlan(state.prefs, timePeriod, mealTypes);
    renderTableForPlan(state.plan, state.prefs, false);
    if (state.user && state.user.email) savePlan(state.user.email, state.plan);
  }
  // history
  saveMealToHistory({ timePeriod, prefs: state.prefs, plan: state.plan });
  toast('✓ Your meal plan has been saved!');
  showPage('plan');
});

backToPrefsBtn.addEventListener('click', () => showPage('preferences'));
editPrefsBtn.addEventListener('click', () => showPage('preferences'));
toShoppingBtn.addEventListener('click', () => {
  renderShoppingListPage();
  showPage('shopping');
});
backToPlanBtn.addEventListener('click', () => showPage('plan'));
downloadListBtn.addEventListener('click', downloadShoppingList);

// Utility functions
function clampInt(n, min, max) { return Math.max(min, Math.min(max, isNaN(n) ? min : n)); }
function toList(v) { return (v||'').split(',').map(s => s.trim().toLowerCase()).filter(Boolean); }

// Meal type checkboxes behavior
(function bindMealTypeCheckboxes(){
  const group = document.getElementById('mealTypeGroup');
  if (!group) return;
  const all = document.getElementById('mtAll');
  const checkboxes = Array.from(group.querySelectorAll('.mt'));
  function syncAllFromChildren(){
    const allChecked = checkboxes.every(c => c.checked);
    if (all) all.checked = allChecked;
  }
  function setChildren(val){ checkboxes.forEach(c => c.checked = val); }
  if (all) {
    all.addEventListener('change', () => setChildren(all.checked));
  }
  checkboxes.forEach(c => c.addEventListener('change', () => {
    if (!checkboxes.some(x => x.checked)) {
      // ensure at least one
      c.checked = true;
      toast('Please select at least one meal type');
    }
    syncAllFromChildren();
  }));
})();

// Seed and load recipes (~500) with added Carnivore diet
function baseRecipes() {
  return [
    { name: 'Chia Pudding', diet: ['vegan','vegetarian','balanced','low-carb','keto'], img: 'https://images.unsplash.com/photo-1517673132405-37045b9cefcb?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 320, carbs: 18, protein: 12, fat: 22 }, type: ['breakfast','snack'],
      ingredients: [
        { item: 'chia seeds', qty: 30, unit: 'g' },
        { item: 'almond milk', qty: 240, unit: 'ml' },
        { item: 'vanilla', qty: 1, unit: 'tsp' },
        { item: 'berries', qty: 80, unit: 'g' },
      ],
      instructions: [
        'Combine chia seeds, almond milk, and vanilla in a jar.',
        'Stir well and refrigerate at least 2 hours (ideally overnight).',
        'Top with berries before serving.',
      ] },
    { name: 'Greek Yogurt (Plain)', diet: ['vegetarian','balanced','high-protein'], img: 'https://images.unsplash.com/photo-1572569511254-d8f925fe2a38?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 190, carbs: 8, protein: 17, fat: 8 }, type: ['breakfast','snack'],
      ingredients: [
        { item: 'greek yogurt', qty: 200, unit: 'g' },
      ],
      instructions: [
        'Spoon yogurt into a bowl and serve chilled.'
      ] },
    { name: 'Greek Yogurt Parfait', diet: ['vegetarian','balanced','high-protein'], img: 'https://images.unsplash.com/photo-1514996937319-344454492b37?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 280, carbs: 32, protein: 18, fat: 8 }, type: ['breakfast','snack'],
      ingredients: [
        { item: 'greek yogurt', qty: 200, unit: 'g' },
        { item: 'granola', qty: 40, unit: 'g' },
        { item: 'berries', qty: 80, unit: 'g' },
        { item: 'honey', qty: 1, unit: 'tbsp' },
      ],
      instructions: [
        'Layer yogurt in a glass.',
        'Add granola and berries.',
        'Drizzle with honey and serve.',
      ] },
    { name: 'Tofu Scramble', diet: ['vegan','vegetarian','high-protein','low-carb','balanced'], img: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 290, carbs: 10, protein: 22, fat: 18 }, type: ['breakfast','lunch'],
      ingredients: [
        { item: 'tofu', qty: 200, unit: 'g' },
        { item: 'turmeric', qty: 0.5, unit: 'tsp' },
        { item: 'spinach', qty: 60, unit: 'g' },
        { item: 'tomato', qty: 1, unit: 'pc' },
        { item: 'onion', qty: 0.5, unit: 'pc' },
      ],
      instructions: [
        'Crumble tofu into a pan with a little oil.',
        'Add turmeric, onion, and cook until fragrant.',
        'Stir in tomato and spinach; cook until wilted.',
        'Season and serve.',
      ] },
    { name: 'Quinoa Chickpea Bowl', diet: ['vegan','vegetarian','balanced'], img: 'https://images.unsplash.com/photo-1550409175-7d3c1de93c89?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 520, carbs: 68, protein: 22, fat: 14 },
      ingredients: [
        { item: 'quinoa', qty: 75, unit: 'g' },
        { item: 'chickpeas', qty: 120, unit: 'g' },
        { item: 'spinach', qty: 60, unit: 'g' },
        { item: 'cucumber', qty: 0.5, unit: 'pc' },
        { item: 'lemon', qty: 0.5, unit: 'pc' },
        { item: 'olive oil', qty: 1, unit: 'tbsp' },
      ],
      instructions: [
        'Cook quinoa per package (about 12–15 min).',
        'Rinse chickpeas; chop cucumber.',
        'Combine quinoa, chickpeas, spinach, cucumber, olive oil, and lemon.',
        'Season with salt and pepper.',
      ] },
    { name: 'Grilled Halloumi Salad', diet: ['vegetarian','low-carb','balanced'], img: 'https://images.unsplash.com/photo-1568158879081-007d9b781b43?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 430, carbs: 14, protein: 24, fat: 30 },
      ingredients: [
        { item: 'halloumi', qty: 120, unit: 'g' },
        { item: 'mixed greens', qty: 80, unit: 'g' },
        { item: 'tomato', qty: 1, unit: 'pc' },
        { item: 'cucumber', qty: 0.5, unit: 'pc' },
        { item: 'olive oil', qty: 1, unit: 'tbsp' },
      ],
      instructions: [
        'Slice and grill halloumi until golden.',
        'Assemble greens, tomato, and cucumber in a bowl.',
        'Top with halloumi and drizzle with olive oil.',
      ] },
    { name: 'Lentil Soup', diet: ['vegan','vegetarian','balanced'], img: 'https://images.unsplash.com/photo-1604908176997-4316511f4b32?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 360, carbs: 48, protein: 20, fat: 8 },
      ingredients: [
        { item: 'lentils', qty: 90, unit: 'g' },
        { item: 'carrot', qty: 1, unit: 'pc' },
        { item: 'celery', qty: 1, unit: 'stalk' },
        { item: 'onion', qty: 0.5, unit: 'pc' },
        { item: 'tomato', qty: 1, unit: 'pc' },
      ],
      instructions: [
        'Sauté onion, carrot, and celery in a pot.',
        'Add lentils and water/stock; simmer until tender (20–25 min).',
        'Stir in chopped tomato; season to taste.',
      ] },
    { name: 'Vegetable Stir-Fry with Tofu', diet: ['vegan','vegetarian','balanced','high-protein'], img: 'https://images.unsplash.com/photo-1617093727343-374698b1e338?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 480, carbs: 42, protein: 26, fat: 22 },
      ingredients: [
        { item: 'tofu', qty: 200, unit: 'g' },
        { item: 'broccoli', qty: 120, unit: 'g' },
        { item: 'bell pepper', qty: 1, unit: 'pc' },
        { item: 'soy sauce', qty: 1, unit: 'tbsp' },
        { item: 'garlic', qty: 2, unit: 'cloves' },
        { item: 'ginger', qty: 1, unit: 'tsp' },
      ],
      instructions: [
        'Stir-fry tofu in a hot pan until edges crisp.',
        'Add broccoli and bell pepper; cook until tender-crisp.',
        'Stir in garlic, ginger, and soy sauce; toss and serve.',
      ] },
    { name: 'Zucchini Noodles with Pesto', diet: ['vegan','vegetarian','low-carb','keto'], img: 'https://images.unsplash.com/photo-1603048297172-c92544798a04?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 380, carbs: 14, protein: 10, fat: 30 },
      ingredients: [
        { item: 'zucchini', qty: 2, unit: 'pc' },
        { item: 'basil', qty: 20, unit: 'g' },
        { item: 'pine nuts', qty: 20, unit: 'g' },
        { item: 'olive oil', qty: 2, unit: 'tbsp' },
        { item: 'garlic', qty: 1, unit: 'clove' },
      ],
      instructions: [
        'Spiralize zucchini into noodles.',
        'Blend basil, pine nuts, olive oil, and garlic into pesto.',
        'Toss zoodles with pesto; season to taste.',
      ] },
    { name: 'Eggplant Parmesan (Light)', diet: ['vegetarian','balanced'], img: 'https://images.unsplash.com/photo-1604908176594-1c7d42937f76?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 520, carbs: 36, protein: 24, fat: 28 },
      ingredients: [
        { item: 'eggplant', qty: 1, unit: 'pc' },
        { item: 'tomato sauce', qty: 200, unit: 'g' },
        { item: 'mozzarella', qty: 80, unit: 'g' },
        { item: 'parmesan', qty: 20, unit: 'g' },
        { item: 'breadcrumbs', qty: 30, unit: 'g' },
      ],
      instructions: [
        'Slice eggplant; bake or air-fry until tender.',
        'Layer with tomato sauce and cheeses; sprinkle breadcrumbs.',
        'Bake until cheese melts and bubbles.',
      ] },
    { name: 'Grilled Salmon with Greens', diet: ['pescatarian','omnivore','mediterranean','balanced','low-carb','high-protein'], img: 'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 520, carbs: 8, protein: 38, fat: 34 },
      ingredients: [
        { item: 'salmon', qty: 180, unit: 'g' },
        { item: 'lemon', qty: 0.5, unit: 'pc' },
        { item: 'olive oil', qty: 1, unit: 'tbsp' },
        { item: 'mixed greens', qty: 80, unit: 'g' },
      ],
      instructions: [
        'Season salmon; grill or pan-sear until just cooked.',
        'Toss greens with lemon and olive oil.',
        'Serve salmon over the dressed greens.',
      ] },
    { name: 'Chicken & Veg Bowl', diet: ['omnivore','high-protein','balanced'], img: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 560, carbs: 42, protein: 42, fat: 20 },
      ingredients: [
        { item: 'chicken breast', qty: 180, unit: 'g' },
        { item: 'brown rice', qty: 75, unit: 'g' },
        { item: 'broccoli', qty: 120, unit: 'g' },
        { item: 'carrot', qty: 1, unit: 'pc' },
        { item: 'soy sauce', qty: 1, unit: 'tbsp' },
      ],
      instructions: [
        'Cook rice per package.',
        'Sauté chicken until browned; add vegetables and cook through.',
        'Splash with soy sauce; serve over rice.',
      ] },
    // Carnivore bases
    { name: 'Ribeye Steak', diet: ['carnivore','omnivore','high-protein','low-carb','keto'], img: 'https://images.unsplash.com/photo-1604908554049-1d055f3ad0fb?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 700, carbs: 0, protein: 55, fat: 50 }, type: ['dinner'],
      ingredients: [ { item: 'ribeye steak', qty: 300, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' }, { item: 'butter', qty: 10, unit: 'g' } ],
      instructions: [ 'Season steak generously.', 'Sear in hot pan with butter to desired doneness.', 'Rest and serve.' ] },
    { name: 'Grilled Chicken Thighs', diet: ['carnivore','omnivore','high-protein','low-carb'], img: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 600, carbs: 0, protein: 45, fat: 40 }, type: ['lunch','dinner'],
      ingredients: [ { item: 'chicken thighs', qty: 300, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Season and grill chicken thighs until juices run clear.' ] },
    { name: 'Seared Salmon', diet: ['carnivore','pescatarian','omnivore','high-protein','low-carb'], img: 'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=1200&auto=format&fit=crop',
      macros: { calories: 520, carbs: 0, protein: 38, fat: 34 }, type: ['lunch','dinner'],
      ingredients: [ { item: 'salmon fillet', qty: 200, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Sear salmon skin-side down until crisp, finish briefly on flesh side.' ] },
    // Additional carnivore varieties
    { name: 'Ground Beef Patties', diet: ['carnivore','omnivore','high-protein','keto','low-carb'], img: '',
      macros: { calories: 450, carbs: 0, protein: 35, fat: 32 }, type: ['lunch','dinner','snack'],
      ingredients: [ { item: 'ground beef', qty: 200, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Form patties, season and pan-sear to desired doneness.' ] },
    { name: 'Pork Chops', diet: ['carnivore','omnivore','high-protein','keto','low-carb'], img: '',
      macros: { calories: 520, carbs: 0, protein: 40, fat: 38 }, type: ['dinner'],
      ingredients: [ { item: 'pork chops', qty: 300, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Season and grill or pan-sear pork chops until cooked through.' ] },
    { name: 'Lamb Chops', diet: ['carnivore','omnivore','high-protein','keto','low-carb'], img: '',
      macros: { calories: 600, carbs: 0, protein: 45, fat: 45 }, type: ['dinner'],
      ingredients: [ { item: 'lamb chops', qty: 280, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Sear lamb chops in a hot pan; rest before serving.' ] },
    { name: 'Beef Liver', diet: ['carnivore','omnivore','high-protein','keto','low-carb'], img: '',
      macros: { calories: 380, carbs: 0, protein: 50, fat: 16 }, type: ['lunch','dinner'],
      ingredients: [ { item: 'beef liver', qty: 200, unit: 'g' }, { item: 'butter', qty: 10, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Quickly pan-fry liver in butter until just cooked; season.' ] },
    { name: 'Bacon & Eggs', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 420, carbs: 2, protein: 24, fat: 34 }, type: ['breakfast','snack'],
      ingredients: [ { item: 'bacon', qty: 100, unit: 'g' }, { item: 'eggs', qty: 3, unit: 'pc' }, { item: 'butter', qty: 5, unit: 'g' } ],
      instructions: [ 'Cook bacon; fry eggs in butter.' ] },
    { name: 'Scrambled Eggs and Cheese', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 380, carbs: 3, protein: 26, fat: 28 }, type: ['breakfast','snack'],
      ingredients: [ { item: 'eggs', qty: 3, unit: 'pc' }, { item: 'cheddar cheese', qty: 40, unit: 'g' }, { item: 'butter', qty: 8, unit: 'g' }, { item: 'salt', qty: 0.5, unit: 'tsp' } ],
      instructions: [ 'Whisk eggs, melt butter in pan, scramble with cheese until softly set. Season.' ] },
    { name: 'Ribeye Steak (Butter Basted)', diet: ['carnivore','omnivore','keto','low-carb','high-protein'], img: '',
      macros: { calories: 780, carbs: 0, protein: 55, fat: 60 }, type: ['dinner'],
      ingredients: [ { item: 'ribeye steak', qty: 320, unit: 'g' }, { item: 'butter', qty: 20, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Baste steak with butter while searing for extra richness.' ] },
    { name: 'Chicken Wings', diet: ['carnivore','omnivore','keto','low-carb','high-protein'], img: '',
      macros: { calories: 620, carbs: 0, protein: 42, fat: 46 }, type: ['lunch','dinner','snack'],
      ingredients: [ { item: 'chicken wings', qty: 350, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Season and bake or air-fry until crispy.' ] },
    { name: 'Salmon Fillets', diet: ['carnivore','pescatarian','omnivore','low-carb','high-protein'], img: '',
      macros: { calories: 520, carbs: 0, protein: 38, fat: 34 }, type: ['lunch','dinner'],
      ingredients: [ { item: 'salmon fillet', qty: 200, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Roast or pan-sear salmon; season and serve.' ] },
    { name: 'Tuna Steaks', diet: ['carnivore','pescatarian','omnivore','low-carb','high-protein'], img: '',
      macros: { calories: 360, carbs: 0, protein: 45, fat: 16 }, type: ['lunch','dinner'],
      ingredients: [ { item: 'tuna steak', qty: 220, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Sear tuna quickly to medium-rare.' ] },
    { name: 'Beef Brisket', diet: ['carnivore','omnivore','keto','low-carb','high-protein'], img: '',
      macros: { calories: 680, carbs: 0, protein: 45, fat: 52 }, type: ['dinner'],
      ingredients: [ { item: 'beef brisket', qty: 250, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Slow-cook brisket until tender.' ] },
    { name: 'Pork Belly', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 750, carbs: 0, protein: 30, fat: 68 }, type: ['dinner','snack'],
      ingredients: [ { item: 'pork belly', qty: 200, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Roast pork belly until crackling is crisp.' ] },
    { name: 'Sardines', diet: ['carnivore','pescatarian','omnivore','keto','low-carb'], img: '',
      macros: { calories: 280, carbs: 0, protein: 30, fat: 18 }, type: ['breakfast','lunch','snack'],
      ingredients: [ { item: 'sardines', qty: 120, unit: 'g' }, { item: 'salt', qty: 0.5, unit: 'tsp' } ],
      instructions: [ 'Open and serve sardines; season lightly.' ] },
    { name: 'Bone Broth', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 120, carbs: 0, protein: 24, fat: 3 }, type: ['snack','breakfast'],
      ingredients: [ { item: 'beef bone broth', qty: 400, unit: 'ml' }, { item: 'salt', qty: 0.5, unit: 'tsp' } ],
      instructions: [ 'Heat broth; season.' ] },
    { name: 'Beef Short Ribs', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 780, carbs: 0, protein: 55, fat: 60 }, type: ['dinner'],
      ingredients: [ { item: 'beef short ribs', qty: 300, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Slow-braise ribs until tender.' ] },
    { name: 'Roast Chicken', diet: ['carnivore','omnivore','low-carb','high-protein'], img: '',
      macros: { calories: 640, carbs: 0, protein: 55, fat: 42 }, type: ['dinner','lunch'],
      ingredients: [ { item: 'whole chicken meat', qty: 300, unit: 'g' }, { item: 'salt', qty: 1, unit: 'tsp' } ],
      instructions: [ 'Roast carved chicken pieces; season.' ] },
    { name: 'Poached Eggs', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 280, carbs: 2, protein: 24, fat: 18 }, type: ['breakfast','snack'],
      ingredients: [ { item: 'eggs', qty: 3, unit: 'pc' }, { item: 'salt', qty: 0.5, unit: 'tsp' } ],
      instructions: [ 'Poach eggs to desired doneness.' ] },
    { name: 'Beef Sausages', diet: ['carnivore','omnivore','keto','low-carb'], img: '',
      macros: { calories: 520, carbs: 0, protein: 26, fat: 44 }, type: ['breakfast','lunch','dinner'],
      ingredients: [ { item: 'beef sausages', qty: 220, unit: 'g' }, { item: 'salt', qty: 0.5, unit: 'tsp' } ],
      instructions: [ 'Pan-fry sausages until browned and cooked through.' ] },
  ];
}

function seedRecipesIfNeeded() {
  const db = ensureDb();
  // Start with base recipes that have proper macros and images
  const recipes = baseRecipes();
  
  // Use simplified dataset with 5 diet types and realistic meals
  const sampleMeals = {
    balanced: [
      { name: "Grilled Chicken with Quinoa", ingredients: ["1 chicken breast", "1 cup quinoa", "1 cup broccoli", "1 tsp olive oil"] },
      { name: "Beef Stir Fry", ingredients: ["200g beef strips", "1 bell pepper", "1 cup rice", "1 tbsp soy sauce"] },
      { name: "Turkey Sandwich", ingredients: ["2 slices whole grain bread", "3 slices turkey", "1 lettuce leaf", "1 slice tomato"] },
      { name: "Omelette with Veggies", ingredients: ["2 eggs", "1/2 cup spinach", "1/4 cup mushrooms", "1 tsp butter"] },
      { name: "Salmon Salad", ingredients: ["150g salmon", "2 cups mixed greens", "1/2 avocado", "1 tbsp vinaigrette"] },
      { name: "Pasta Primavera", ingredients: ["1 cup pasta", "1 cup mixed vegetables", "1 tsp olive oil", "1 tbsp parmesan"] },
      { name: "Chicken Tacos", ingredients: ["2 small tortillas", "100g chicken", "1/4 cup salsa", "1/4 cup lettuce"] },
      { name: "Beef Chili", ingredients: ["200g minced beef", "1 cup kidney beans", "1/2 cup tomatoes", "1 tsp chili powder"] },
      { name: "Quinoa Bowl", ingredients: ["1 cup quinoa", "1/2 cup chickpeas", "1 cup spinach", "1 tbsp tahini"] },
      { name: "Stuffed Peppers", ingredients: ["2 bell peppers", "100g rice", "50g minced beef", "1/4 cup tomato sauce"] },
    ],
    vegan: [
      // Breakfast (15)
      { name: "Overnight oats with almond milk, chia seeds, and mixed berries", ingredients: ["oats", "almond milk", "chia seeds", "mixed berries"] },
      { name: "Tofu scramble with spinach, mushrooms, and turmeric on whole grain toast", ingredients: ["tofu", "spinach", "mushrooms", "turmeric", "whole grain bread"] },
      { name: "Smoothie bowl with banana, spinach, almond milk, and flaxseed, topped with granola", ingredients: ["banana", "spinach", "almond milk", "flaxseed", "granola"] },
      { name: "Peanut butter and banana on whole grain toast with hemp seeds", ingredients: ["peanut butter", "banana", "whole grain bread", "hemp seeds"] },
      { name: "Warm quinoa porridge with apple, cinnamon, and walnuts", ingredients: ["quinoa", "apple", "cinnamon", "walnuts"] },
      { name: "Chia pudding with coconut milk, mango, and toasted coconut flakes", ingredients: ["chia seeds", "coconut milk", "mango", "coconut flakes"] },
      { name: "Avocado toast with cherry tomatoes and pumpkin seeds", ingredients: ["avocado", "cherry tomatoes", "pumpkin seeds", "bread"] },
      { name: "Oat flour pancakes topped with fresh strawberries and maple syrup", ingredients: ["oat flour", "strawberries", "maple syrup"] },
      { name: "Buckwheat porridge with blueberries and almond butter", ingredients: ["buckwheat", "blueberries", "almond butter"] },
      { name: "Vegan yogurt parfait with granola, kiwi, and sunflower seeds", ingredients: ["vegan yogurt", "granola", "kiwi", "sunflower seeds"] },
      { name: "Savory oatmeal with sautéed kale, mushrooms, and tahini", ingredients: ["oats", "kale", "mushrooms", "tahini"] },
      { name: "Apple-cinnamon smoothie with oats, almond milk, and peanut butter", ingredients: ["apple", "cinnamon", "oats", "almond milk", "peanut butter"] },
      { name: "Banana-oat baked muffins with raisins and walnuts", ingredients: ["banana", "oats", "raisins", "walnuts"] },
      { name: "Whole grain bagel with hummus, cucumber, and sprouts", ingredients: ["bagel", "hummus", "cucumber", "sprouts"] },
      { name: "Protein smoothie with pea protein, banana, spinach, and oat milk", ingredients: ["pea protein", "banana", "spinach", "oat milk"] },

      // Lunch (15)
      { name: "Chickpea salad wrap with tahini-lemon dressing", ingredients: ["chickpeas", "wrap", "lettuce", "tomato", "tahini", "lemon"] },
      { name: "Quinoa and roasted vegetable bowl with chickpeas and avocado", ingredients: ["quinoa", "roasted vegetables", "chickpeas", "avocado"] },
      { name: "Lentil soup with carrots, celery, and tomatoes", ingredients: ["lentils", "carrots", "celery", "tomatoes", "vegetable broth"] },
      { name: "Brown rice Buddha bowl with tofu, broccoli, edamame, sesame-ginger sauce", ingredients: ["brown rice", "tofu", "broccoli", "edamame", "sesame", "ginger"] },
      { name: "Mediterranean couscous salad with chickpeas, cucumber, tomato, olives, parsley", ingredients: ["couscous", "chickpeas", "cucumber", "tomato", "olives", "parsley"] },
      { name: "Hummus and veggie pita with carrots, peppers, and spinach", ingredients: ["pita", "hummus", "carrots", "peppers", "spinach"] },
      { name: "Soba noodle salad with edamame, green onions, carrots, soy-sesame dressing", ingredients: ["soba noodles", "edamame", "green onions", "carrots", "soy sauce", "sesame oil"] },
      { name: "Burrito bowl with black beans, brown rice, corn, pico de gallo, guacamole", ingredients: ["black beans", "brown rice", "corn", "tomato", "onion", "cilantro", "avocado"] },
      { name: "Warm farro salad with roasted sweet potato, kale, cranberries, pecans", ingredients: ["farro", "sweet potato", "kale", "cranberries", "pecans"] },
      { name: "Rainbow quinoa tabbouleh with parsley, mint, lemon, cherry tomatoes", ingredients: ["quinoa", "parsley", "mint", "lemon", "cherry tomatoes"] },
      { name: "Barley and white bean salad with arugula and lemon-tahini dressing", ingredients: ["barley", "white beans", "arugula", "lemon", "tahini"] },
      { name: "Roasted cauliflower tacos with cabbage slaw and cashew crema", ingredients: ["cauliflower", "tortillas", "cabbage", "cashews", "lime"] },
      { name: "Mediterranean pasta salad with tomatoes, artichokes, olives, basil vinaigrette", ingredients: ["pasta", "tomatoes", "artichokes", "olives", "basil"] },
      { name: "Veggie sushi rolls with avocado, cucumber, carrot, sesame seeds", ingredients: ["sushi rice", "nori", "avocado", "cucumber", "carrot", "sesame seeds"] },
      { name: "Curried chickpea salad over greens with raisins and almonds", ingredients: ["chickpeas", "curry powder", "greens", "raisins", "almonds"] },

      // Dinner (15)
      { name: "Stir-fried tofu with broccoli, bell peppers, and brown rice", ingredients: ["tofu", "broccoli", "bell peppers", "brown rice", "tamari"] },
      { name: "Red lentil dal with spinach and basmati rice", ingredients: ["red lentils", "spinach", "basmati rice", "cumin", "turmeric"] },
      { name: "Chickpea and vegetable curry with coconut milk and quinoa", ingredients: ["chickpeas", "mixed vegetables", "coconut milk", "quinoa", "curry"] },
      { name: "Vegan chili with kidney beans, black beans, tomatoes, and corn", ingredients: ["kidney beans", "black beans", "tomatoes", "corn"] },
      { name: "Baked tofu with roasted Brussels sprouts and sweet potatoes", ingredients: ["tofu", "Brussels sprouts", "sweet potatoes", "olive oil"] },
      { name: "Whole wheat pasta with tomato-basil sauce, mushrooms, and spinach", ingredients: ["whole wheat pasta", "tomato", "basil", "mushrooms", "spinach"] },
      { name: "Stuffed bell peppers with quinoa, black beans, corn, salsa", ingredients: ["bell peppers", "quinoa", "black beans", "corn", "salsa"] },
      { name: "Eggplant and chickpea stew with tomatoes over couscous", ingredients: ["eggplant", "chickpeas", "tomatoes", "couscous"] },
      { name: "Mushroom and spinach risotto with nutritional yeast", ingredients: ["arborio rice", "mushrooms", "spinach", "nutritional yeast", "vegetable broth"] },
      { name: "Cauliflower steak with chimichurri, herbed potatoes, green beans", ingredients: ["cauliflower", "parsley", "garlic", "potatoes", "green beans"] },
      { name: "Peanut noodle bowl with veggies and baked tofu", ingredients: ["noodles", "tofu", "peanut butter", "lime", "soy sauce"] },
      { name: "Butternut squash and white bean stew with kale", ingredients: ["butternut squash", "white beans", "kale", "vegetable broth"] },
      { name: "Zucchini noodles with cherry tomatoes, basil, toasted pine nuts", ingredients: ["zucchini", "cherry tomatoes", "basil", "pine nuts"] },
      { name: "BBQ jackfruit sandwiches with cabbage slaw on whole grain buns", ingredients: ["jackfruit", "BBQ sauce", "cabbage", "whole grain buns"] },
      { name: "Moroccan chickpea tagine with apricots, carrots, almonds over millet", ingredients: ["chickpeas", "apricots", "carrots", "almonds", "millet"] },

      // Snacks (15)
      { name: "Apple slices with almond butter and cinnamon", ingredients: ["apple", "almond butter", "cinnamon"] },
      { name: "Carrot and cucumber sticks with hummus", ingredients: ["carrot", "cucumber", "hummus"] },
      { name: "Trail mix with almonds, cashews, pumpkin seeds, dried cranberries", ingredients: ["almonds", "cashews", "pumpkin seeds", "dried cranberries"] },
      { name: "Rice cakes topped with avocado and chili flakes", ingredients: ["rice cakes", "avocado", "chili flakes"] },
      { name: "Fresh fruit salad with mint and lime", ingredients: ["assorted fruit", "mint", "lime"] },
      { name: "Roasted chickpeas seasoned with paprika and garlic", ingredients: ["chickpeas", "paprika", "garlic"] },
      { name: "Dates stuffed with peanut butter", ingredients: ["dates", "peanut butter"] },
      { name: "Edamame with sea salt and lemon", ingredients: ["edamame", "sea salt", "lemon"] },
      { name: "Vegan yogurt with chia seeds and blueberries", ingredients: ["vegan yogurt", "chia seeds", "blueberries"] },
      { name: "Celery sticks with sunflower seed butter", ingredients: ["celery", "sunflower seed butter"] },
      { name: "Air-popped popcorn with nutritional yeast", ingredients: ["popcorn", "nutritional yeast"] },
      { name: "Banana with tahini drizzle and sesame seeds", ingredients: ["banana", "tahini", "sesame seeds"] },
      { name: "Oatmeal cookies sweetened with banana and raisins (no dairy)", ingredients: ["oats", "banana", "raisins"] },
      { name: "Smoothie with pineapple, spinach, and coconut water", ingredients: ["pineapple", "spinach", "coconut water"] },
      { name: "Mixed berries with a handful of walnuts", ingredients: ["mixed berries", "walnuts"] },
    ],
    vegetarian: [
      { name: "Cheese Omelette", ingredients: ["2 eggs", "1/4 cup cheese", "1/2 cup spinach", "1 tsp butter"] },
      { name: "Caprese Salad", ingredients: ["1 tomato", "50g mozzarella", "1 tsp olive oil", "1/2 cup basil leaves"] },
      { name: "Vegetable Pasta", ingredients: ["1 cup pasta", "1/2 cup bell peppers", "1/2 cup mushrooms", "1 tbsp olive oil"] },
      { name: "Veggie Burger", ingredients: ["1 veggie patty", "1 whole grain bun", "1 lettuce leaf", "1 tomato slice"] },
      { name: "Spinach & Feta Quiche", ingredients: ["2 eggs", "1/2 cup spinach", "1/4 cup feta", "1 tsp olive oil"] },
      { name: "Grilled Cheese Sandwich", ingredients: ["2 slices bread", "2 slices cheese", "1 tsp butter"] },
      { name: "Vegetable Stir Fry", ingredients: ["1 cup broccoli", "1/2 cup carrots", "1/2 cup bell peppers", "1 tbsp soy sauce"] },
      { name: "Mushroom Risotto", ingredients: ["1 cup rice", "1 cup mushrooms", "1/4 cup parmesan", "1 tbsp olive oil"] },
      { name: "Veggie Tacos", ingredients: ["2 tortillas", "1/2 cup beans", "1/4 cup lettuce", "1/4 cup salsa"] },
      { name: "Greek Salad", ingredients: ["1 tomato", "1/2 cucumber", "50g feta", "1 tbsp olive oil"] },
    ],
    pescatarian: [
      { name: "Grilled Salmon", ingredients: ["150g salmon", "1 cup broccoli", "1/2 cup rice", "1 tsp olive oil"] },
      { name: "Tuna Salad", ingredients: ["1 can tuna", "1/2 cup lettuce", "1/4 cup cucumber", "1 tbsp vinaigrette"] },
      { name: "Shrimp Stir Fry", ingredients: ["100g shrimp", "1 cup bell peppers", "1/2 cup carrots", "1 tbsp soy sauce"] },
      { name: "Fish Tacos", ingredients: ["2 tortillas", "100g white fish", "1/4 cup cabbage", "1 tbsp salsa"] },
      { name: "Grilled Cod with Veggies", ingredients: ["150g cod", "1 cup asparagus", "1/2 cup rice", "1 tsp olive oil"] },
      { name: "Salmon Quinoa Bowl", ingredients: ["150g salmon", "1 cup quinoa", "1/2 cup spinach", "1 tbsp lemon juice"] },
      { name: "Tuna Sandwich", ingredients: ["2 slices bread", "1 can tuna", "1 lettuce leaf", "1 tomato slice"] },
      { name: "Pasta with Shrimp", ingredients: ["1 cup pasta", "100g shrimp", "1/2 cup peas", "1 tsp olive oil"] },
      { name: "Fish & Veggie Bowl", ingredients: ["150g tilapia", "1 cup broccoli", "1/2 cup carrots", "1 tbsp soy sauce"] },
      { name: "Seafood Paella", ingredients: ["100g shrimp", "50g mussels", "1/2 cup rice", "1/4 cup peas"] },
    ],
    mediterranean: [
      { name: "Greek Salad with Chicken", ingredients: ["100g chicken", "1 cup lettuce", "1 tomato", "50g feta"] },
      { name: "Hummus & Veggie Wrap", ingredients: ["1 wrap", "2 tbsp hummus", "1/2 cup cucumber", "1/4 cup carrots"] },
      { name: "Grilled Veggies with Couscous", ingredients: ["1 cup couscous", "1/2 cup zucchini", "1/2 cup bell peppers", "1 tsp olive oil"] },
      { name: "Mediterranean Quinoa Bowl", ingredients: ["1 cup quinoa", "1/2 cup chickpeas", "1/2 cup tomato", "1 tbsp olive oil"] },
      { name: "Baked Fish with Veggies", ingredients: ["150g white fish", "1/2 cup zucchini", "1/2 cup tomatoes", "1 tsp olive oil"] },
      { name: "Caprese Sandwich", ingredients: ["2 slices bread", "50g mozzarella", "1 tomato", "1 tsp olive oil"] },
      { name: "Chickpea Salad", ingredients: ["1 cup chickpeas", "1/2 cup cucumber", "1/2 cup tomato", "1 tbsp olive oil"] },
      { name: "Vegetable Pasta with Pesto", ingredients: ["1 cup pasta", "1/2 cup zucchini", "1/4 cup pesto", "1 tsp olive oil"] },
      { name: "Mediterranean Omelette", ingredients: ["2 eggs", "1/4 cup feta", "1/2 cup spinach", "1 tsp olive oil"] },
      { name: "Grilled Chicken with Veggies", ingredients: ["100g chicken", "1/2 cup bell peppers", "1/2 cup zucchini", "1 tsp olive oil"] },
    ],
  };

  // Add simplified meals to the existing recipes (avoid duplicates by name)
  const existingNames = new Set(recipes.map(r => r.name.toLowerCase()));
  Object.entries(sampleMeals).forEach(([diet, meals]) => {
    meals.forEach(m => {
      if (!existingNames.has(m.name.toLowerCase())) {
        recipes.push({
          name: m.name,
          diet: [diet],
          img: '',
          macros: { calories: 0, carbs: 0, protein: 0, fat: 0 },
          type: ['breakfast','lunch','dinner','snack'],
          ingredients: (m.ingredients || []).map(s => typeof s === 'string' ? s : String(s)),
          instructions: ['Prepare ingredients and cook/assemble as desired.'],
        });
        existingNames.add(m.name.toLowerCase());
      }
    });
  });

  db.recipes = recipes;
  dbSave(db);
  return recipes;
}

const RECIPES = seedRecipesIfNeeded();

// Build a shuffled pool for given prefs, excluding used names, widening if needed
function buildShuffledPool(prefs, needed, usedSet) {
  const { dietType, allergies, exclusions } = prefs;
  const avoid = new Set([...(allergies||[]), ...(exclusions||[])]);
  const respectsAvoid = (r) => (r.ingredients||[]).every(i => !containsAny(typeof i === 'string' ? i : i.item, avoid));

  // Strict diet filter: only include recipes tagged with the selected diet
  let pool = RECIPES
    .filter(r => r.diet.includes(dietType))
    .filter(respectsAvoid)
    .filter(r => !usedSet.has(r.name));

  // If pool looks small, widen WITHIN the same diet only (never pull other diets)
  if (pool.length < needed) {
    const extrasSameDiet = RECIPES
      .filter(r => r.diet.includes(dietType))
      .filter(respectsAvoid)
      .filter(r => !usedSet.has(r.name));
    pool = uniqueByName([...pool, ...extrasSameDiet]);
  }

  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function generateWeekPhase(prefs, dayCount, usedSet, dayOffset=0) {
  const days = [];
  for (let d = 0; d < dayCount; d++) {
    const needed = prefs.mealsPerDay;
    let pool = buildShuffledPool(prefs, needed, usedSet);
    const take = Math.min(needed, pool.length);
    const dayMeals = pool.slice(0, take);
    dayMeals.forEach(r => usedSet.add(r.name));
    days.push({ day: dayOffset + d + 1, meals: dayMeals, totals: { calories:0, carbs:0, protein:0, fat:0 } });
  }
  return { days, used: usedSet };
}

function startWeekTwoPhase(prefs) {
  // Generate all 7 days at once to ensure no blanks
  const used = new Set();
  const weekPhase = generateWeekPhase(prefs, 7, used, 0);
  state.plan = { days: weekPhase.days, totals: { calories:0, carbs:0, protein:0, fat:0 } };
  if (state.user && state.user.email) savePlan(state.user.email, state.plan);
  renderWeeklySuggested(state.plan);
}


function generatePlan(prefs, timePeriod = 'today', selectedMealTypes = ['breakfast','lunch','dinner','snack']) {
  const { dietType, mealsPerDay, allergies, exclusions } = prefs;
  const avoid = new Set([...(allergies||[]), ...(exclusions||[])]);

  const respectsAvoid = (r) => (r.ingredients||[]).every(i => !containsAny(typeof i === 'string' ? i : i.item, avoid));

  // Build and shuffle a pool for the selected diet only, filter by avoid list (strict)
  let pool = RECIPES.filter(r => r.diet.includes(dietType)).filter(respectsAvoid);
  pool = uniqueByName(pool);
  // Shuffle to increase variety
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const dayCount = timePeriod === 'week' ? 7 : 1;
  const totalNeeded = mealsPerDay * dayCount;
  const picked = pool.slice(0, Math.min(pool.length, totalNeeded));

  const days = [];
  for (let d = 0; d < dayCount; d++) {
    const start = d * mealsPerDay;
    const slice = picked.slice(start, start + mealsPerDay);
    days.push({ day: d+1, meals: slice, totals: { calories: 0, carbs: 0, protein: 0, fat: 0 } });
  }

  if (timePeriod === 'week') {
    return { days, totals: { calories: 0, carbs: 0, protein: 0, fat: 0 } };
  }
  return { meals: days[0].meals, totals: days[0].totals };
}

function uniqueByName(arr) {
  const seen = new Set();
  const res = [];
  for (const r of arr) { if (!seen.has(r.name)) { seen.add(r.name); res.push(r); } }
  return res;
}

function containsAny(ingredient, avoidSet) {
  const token = String(ingredient).toLowerCase();
  for (const a of avoidSet) {
    if (!a) continue;
    if (token.includes(String(a).toLowerCase())) return true;
  }
  return false;
}

function macroDistance(current, target) {
  const wc = 1, wcarb = 0.6, wp = 0.8, wf = 0.6;
  return (
    wc * sqRatio(current.calories, target.calories) +
    wcarb * sqRatio(current.carbs, target.carbs) +
    wp * sqRatio(current.protein, target.protein) +
    wf * sqRatio(current.fat, target.fat)
  );
}
function sqRatio(a, b) { const r = (a - b) / Math.max(1, b); return r * r; }

// Favorites helpers
function isFav(name) { return state.favorites.has(name); }
function toggleFav(name) {
  if (!state.user || !state.user.email) return;
  if (state.favorites.has(name)) state.favorites.delete(name); else state.favorites.add(name);
  saveFavorites(state.user.email, Array.from(state.favorites));
}

// Suggestions
function suggestToday(prefs) {
  const temp = { ...prefs, mealsPerDay: Math.min(3, Math.max(1, prefs.mealsPerDay || 3)) };
  return generatePlan(temp);
}
function suggestWeek(prefs) {
  return generatePlan(prefs, 'week', ['breakfast','lunch','dinner','snack']);
}

// Render plan with like buttons and suggestion controls
function renderPlan(plan, prefs) {
  const { meals, totals } = plan;
  const container = document.getElementById('mealsContainer');
  const summary = document.getElementById('planSummary');

  container.innerHTML = '';

  // Inject suggestion + favorites toolbar above summary
  const toolbarId = 'planToolbar';
  let toolbar = document.getElementById(toolbarId);
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = toolbarId;
    toolbar.className = 'plan-toolbar';
    summary.parentNode.insertBefore(toolbar, summary);
  }
  toolbar.innerHTML = `
    <div class="toolbar-row">
      <div class="left">
        <button id="btnSuggestToday" class="btn small">Suggest Today</button>
        <button id="btnSuggestWeek" class="btn small">Suggest Week</button>
        <button id="btnShowFavs" class="btn small">Show Favorites</button>
      </div>
      <div class="right">
        <span id="favCount" class="muted">Favorites: ${state.favorites.size}</span>
      </div>
    </div>
  `;

  const bindToolbar = () => {
    document.getElementById('btnSuggestToday').onclick = () => {
      const s = suggestToday(prefs);
      state.suggestions = { today: s };
      if (state.user && state.user.email) saveSuggestions(state.user.email, state.suggestions);
      renderSuggested(s);
    };
    document.getElementById('btnSuggestWeek').onclick = () => {
      const s = suggestWeek(prefs);
      state.suggestions = { week: s };
      if (state.user && state.user.email) saveSuggestions(state.user.email, state.suggestions);
      renderWeeklySuggested(s);
    };
    document.getElementById('btnShowFavs').onclick = () => {
      renderFavoritesView();
    };
  };
  bindToolbar();

  summary.textContent = `Diet: ${pretty(prefs.dietType)} • Meals: ${prefs.mealsPerDay}`;

  const ingredientMap = new Map();

  meals.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'meal-card';
    const ingList = m.ingredients.map(i => (typeof i === 'string' ? i : i.item)).join(', ');
    const steps = m.instructions.map((step) => `<li>${step}</li>`).join('');
    const liked = isFav(m.name);
    card.innerHTML = `
      ${state.showImages ? `<img alt="${m.name}" src="${m.img}"/>` : ''}
      <div class="content">
        <h4>${idx+1}. ${m.name}${m.substituted ? ' (substituted)' : ''}
          <button class="like-btn" data-name="${m.name}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button>
        </h4>
        <div class="macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
        <div class="muted">Ingredients: ${ingList}</div>
        <div class="details">
          <button class="details-toggle" type="button">View recipe</button>
          <div class="details-content">
            <ol class="instructions">${steps}</ol>
          </div>
        </div>
      </div>
    `;

    if (state.showImages) {
      const img = card.querySelector('img');
      const usedImages = new Set([...document.querySelectorAll('#mealsContainer img')].map(i => i.getAttribute('src')));
      if (img && usedImages.has(m.img)) {
        img.src = altImageFor(m.name, m.img);
      }
      if (img) {
        img.addEventListener('error', () => {
          img.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200&auto=format&fit=crop';
        }, { once: true });
      }
    }

    const details = card.querySelector('.details');
    const toggle = card.querySelector('.details-toggle');
    toggle.addEventListener('click', () => details.classList.toggle('open'));

    const likeBtn = card.querySelector('.like-btn');
    likeBtn.addEventListener('click', () => {
      toggleFav(m.name);
      likeBtn.textContent = isFav(m.name) ? '♥' : '♡';
      likeBtn.setAttribute('aria-pressed', String(isFav(m.name)));
      const favCount = document.getElementById('favCount');
      const favCountTable = document.getElementById('favCountTable');
      if (favCount) favCount.textContent = `Favorites: ${state.favorites.size}`;
      if (favCountTable) favCountTable.textContent = `Favorites: ${state.favorites.size}`;
    });

    container.appendChild(card);

    m.ingredients.forEach(i => {
      const item = typeof i === 'string' ? { item: i, qty: 1, unit: 'x' } : i;
      const key = `${item.item}__${item.unit}`;
      const current = ingredientMap.get(key) || { item: item.item, qty: 0, unit: item.unit };
      current.qty += item.qty;
      ingredientMap.set(key, current);
    });
  });

  state.planList = [...ingredientMap.values()]
    .sort((a,b) => a.item.localeCompare(b.item))
    .map(({ item, qty, unit }) => `${humanizeItem(item, qty, unit)}`);
}

function renderFavoritesView() {
  const container = document.getElementById('mealsContainer');
  const summary = document.getElementById('planSummary');
  const favNames = Array.from(state.favorites);
  const favMeals = RECIPES.filter(r => favNames.includes(r.name));
  summary.textContent = '';
  container.innerHTML = '';
  
  // Add Favorites section label
  const sectionLabel = document.createElement('h3');
  sectionLabel.className = 'section-label';
  sectionLabel.textContent = `Favorites (${favMeals.length})`;
  container.appendChild(sectionLabel);
  favMeals.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'meal-card';
    const ingList = m.ingredients.map(i => (typeof i === 'string' ? i : i.item)).join(', ');
    const steps = m.instructions.map((step) => `<li>${step}</li>`).join('');
    const liked = isFav(m.name);
    card.innerHTML = `
      ${state.showImages ? `<img alt="${m.name}" src="${m.img}"/>` : ''}
      <div class="content">
        <h4>${idx+1}. ${m.name}
          <button class="like-btn" data-name="${m.name}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button>
        </h4>
        <div class="macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
        <div class="muted">Ingredients: ${ingList}</div>
        <div class="details">
          <button class="details-toggle" type="button">View recipe</button>
          <div class="details-content">
            <ol class="instructions">${steps}</ol>
          </div>
        </div>
      </div>
    `;
    const details = card.querySelector('.details');
    const toggle = card.querySelector('.details-toggle');
    toggle.addEventListener('click', () => details.classList.toggle('open'));
    const likeBtn = card.querySelector('.like-btn');
    likeBtn.addEventListener('click', () => {
      toggleFav(m.name);
      card.remove();
      const favCount = document.getElementById('favCount');
      const favCountTable = document.getElementById('favCountTable');
      if (favCount) favCount.textContent = `Favorites: ${state.favorites.size}`;
      if (favCountTable) favCountTable.textContent = `Favorites: ${state.favorites.size}`;
    });
    document.getElementById('mealsContainer').appendChild(card);
  });
}

function renderSuggested(todayPlan) {
  renderTableForPlan(todayPlan, state.prefs, false);
}

function mealTypesFromPrefs(prefs){
  const t = prefs?.mealTypes && prefs.mealTypes.length ? prefs.mealTypes : ['breakfast','lunch','dinner','snack'];
  return ['breakfast','lunch','dinner','snack'].filter(x => t.includes(x));
}
function typesForRecipe(r){
  return Array.isArray(r.type) ? r.type : (r.type ? [r.type] : ['lunch','dinner']);
}
function allocateMealsToSlots(meals, selectedTypes){
  // Fill selected types sequentially to avoid blanks
  const slots = {};
  selectedTypes.forEach(t => slots[t] = null);
  let i = 0;
  for (const st of selectedTypes){
    if (i < meals.length) {
      slots[st] = meals[i++];
    }
  }
  return slots;
}
function renderTableForPlan(plan, prefs, isWeek){
  const container = document.getElementById('mealsContainer');
  const summary = document.getElementById('planSummary');
  container.innerHTML = '';
  
  // Add toolbar with Save Meals button and Favorites/Saved Meals sections
  const toolbarId = 'planTableToolbar';
  let toolbar = document.getElementById(toolbarId);
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = toolbarId;
    toolbar.className = 'plan-toolbar';
    container.parentNode.insertBefore(toolbar, container);
  }
  const hasSavedMeals = state.savedMeals && state.savedMeals.plan;
  toolbar.innerHTML = `
    <div class="toolbar-row">
      <div class="left">
        <button id="btnShowFavsTable" class="btn small">Favorites</button>
        <button id="btnShowSavedMeals" class="btn small ${!hasSavedMeals ? 'hidden' : ''}">Saved Meals</button>
      </div>
      <div class="right">
        <span id="favCountTable" class="muted">Favorites: ${state.favorites.size}</span>
      </div>
    </div>
  `;
  
  // Bind toolbar buttons
  document.getElementById('btnShowFavsTable').onclick = () => {
    renderFavoritesView();
  };
  
  const btnShowSaved = document.getElementById('btnShowSavedMeals');
  if (btnShowSaved) {
    btnShowSaved.onclick = () => {
      if (state.savedMeals && state.savedMeals.plan) {
        state.plan = state.savedMeals.plan;
        state.prefs = state.savedMeals.prefs;
        const isWeekView = state.savedMeals.timePeriod === 'week';
        renderTableForPlan(state.savedMeals.plan, state.savedMeals.prefs, isWeekView);
        toast('Showing saved meal plan');
      }
    };
  }
  
  const selectedTypes = mealTypesFromPrefs(prefs);
  // Build table
  const table = document.createElement('table');
  table.className = 'meal-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  trh.innerHTML = `<th>Day</th>${selectedTypes.map(t=>`<th>${pretty(t)}</th>`).join('')}`;
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  if (isWeek) {
    plan.days.forEach((day, idx) => {
      const slots = allocateMealsToSlots(day.meals, selectedTypes);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="day-col">Day ${idx+1}</td>` + selectedTypes.map(t => {
        const m = slots[t];
        if (!m) return `<td class="empty">—</td>`;
        const steps = (m.instructions||[]).map(s=>`<li>${s}</li>`).join('');
        const ing = (m.ingredients||[]).map(i=> (typeof i==='string'? i : i.item)).join(', ');
        const liked = isFav(m.name);
        return `<td>
          <div class="cell-meal">
            <div class="cell-top">
              <div class="cell-name">${m.name}${m.substituted?' <span class="tag">sub</span>':''}</div>
              <div class="cell-actions">
                <button class="cell-like" data-name="${m.name}" aria-pressed="${liked}" title="Add to favorites">${liked ? '♥' : '♡'}</button>
                <button class="cell-save" data-plan-save="true" title="Save meal plan" aria-label="Save meal plan">↓</button>
                <button class="cell-toggle" type="button">Details</button>
              </div>
            </div>
            <div class="cell-macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
            <div class="cell-details">
              <div class="muted">Ingredients: ${ing}</div>
              <ol class="instructions">${steps}</ol>
            </div>
          </div>
        </td>`;
      }).join('');
      tbody.appendChild(tr);
    });
    summary.textContent = 'Weekly plan';
  } else {
    const slots = allocateMealsToSlots(plan.meals, selectedTypes);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="day-col">Today</td>` + selectedTypes.map(t => {
      const m = slots[t];
      if (!m) return `<td class="empty">—</td>`;
      const steps = (m.instructions||[]).map(s=>`<li>${s}</li>`).join('');
      const ing = (m.ingredients||[]).map(i=> (typeof i==='string'? i : i.item)).join(', ');
      const liked = isFav(m.name);
      return `<td>
        <div class="cell-meal">
          <div class="cell-top">
            <div class="cell-name">${m.name}${m.substituted?' <span class="tag">sub</span>':''}</div>
            <div class="cell-actions">
              <button class="cell-like" data-name="${m.name}" aria-pressed="${liked}" title="Add to favorites">${liked ? '♥' : '♡'}</button>
              <button class="cell-save" data-plan-save="true" title="Save meal plan" aria-label="Save meal plan">↓</button>
              <button class="cell-toggle" type="button">Details</button>
            </div>
          </div>
          <div class="cell-macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
          <div class="cell-details">
            <div class="muted">Ingredients: ${ing}</div>
            <ol class="instructions">${steps}</ol>
          </div>
        </div>
      </td>`;
    }).join('');
    tbody.appendChild(tr);
    summary.textContent = '';
  }

  table.appendChild(tbody);
  container.appendChild(table);

  // bind toggles
  container.querySelectorAll('.cell-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const cell = btn.closest('.cell-meal');
      if (cell) cell.classList.toggle('open');
    });
  });
  // bind likes
  container.querySelectorAll('.cell-like').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      toggleFav(name);
      btn.textContent = isFav(name) ? '♥' : '♡';
      btn.setAttribute('aria-pressed', String(isFav(name)));
      const favCount = document.getElementById('favCount');
      const favCountTable = document.getElementById('favCountTable');
      if (favCount) favCount.textContent = `Favorites: ${state.favorites.size}`;
      if (favCountTable) favCountTable.textContent = `Favorites: ${state.favorites.size}`;
    });
  });
  // bind save buttons
  container.querySelectorAll('.cell-save').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!plan) {
        toast('No meal plan to save');
        return;
      }
      const savedData = {
        timePeriod: prefs.timePeriod || (isWeek ? 'week' : 'today'),
        prefs: prefs,
        plan: JSON.parse(JSON.stringify(plan)) // Deep copy
      };
      state.savedMeals = savedData;
      state.plan = plan;
      if (state.user && state.user.email) {
        saveSavedMeals(state.user.email, savedData);
      }
      toast('✓ Meal plan saved!');
      // Update toolbar to show saved meals button
      const btnShowSaved = document.getElementById('btnShowSavedMeals');
      if (btnShowSaved) btnShowSaved.classList.remove('hidden');
      // Visual feedback - briefly highlight the button
      btn.classList.add('saved');
      setTimeout(() => btn.classList.remove('saved'), 1000);
    });
  });

  // Build shopping list aggregation from displayed meals
  const ingredientMap = new Map();
  const usedMeals = new Set();
  if (isWeek) {
    plan.days.forEach(day => {
      const slots = allocateMealsToSlots(day.meals, selectedTypes);
      Object.values(slots).forEach(m => {
        if (!m || usedMeals.has(m.name)) return; usedMeals.add(m.name);
        (m.ingredients||[]).forEach(i => {
          const item = typeof i === 'string' ? { item: i, qty: 1, unit: 'x' } : i;
          const key = `${item.item}__${item.unit}`;
          const current = ingredientMap.get(key) || { item: item.item, qty: 0, unit: item.unit };
          current.qty += item.qty; ingredientMap.set(key, current);
        });
      });
    });
  } else {
    const slots = allocateMealsToSlots(plan.meals, selectedTypes);
    Object.values(slots).forEach(m => {
      if (!m || usedMeals.has(m.name)) return; usedMeals.add(m.name);
      (m.ingredients||[]).forEach(i => {
        const item = typeof i === 'string' ? { item: i, qty: 1, unit: 'x' } : i;
        const key = `${item.item}__${item.unit}`;
        const current = ingredientMap.get(key) || { item: item.item, qty: 0, unit: item.unit };
        current.qty += item.qty; ingredientMap.set(key, current);
      });
    });
  }
  state.planList = [...ingredientMap.values()].sort((a,b)=>a.item.localeCompare(b.item)).map(({item,qty,unit})=>`${humanizeItem(item, qty, unit)}`);
}

function renderWeeklySuggested(week) {
  // use table renderer for weekly
  renderTableForPlan(week, state.prefs, true);
}

function renderShoppingListPage() {
  const listEl = document.getElementById('shoppingListPage');
  listEl.innerHTML = '';
  (state.planList || []).forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    listEl.appendChild(li);
  });
}

function downloadShoppingList() {
  const lines = state.planList && state.planList.length ? state.planList : [];
  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shopping-list.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pretty(key) { return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// History helpers
function loadMealHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
function saveMealHistory(arr) { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); }
function saveMealToHistory({ timePeriod, prefs, plan }) {
  try {
    const history = loadMealHistory();
    const now = new Date();
    const entry = {
      id: Date.now(),
      date: now.toLocaleString(),
      name: 'My Meal Plan',
      timePeriod,
      meals: timePeriod === 'week' ? plan.days.flatMap(d => d.meals) : plan.meals,
      preferences: prefs,
      totals: plan.totals,
    };
    const next = [entry, ...history].slice(0, 10);
    saveMealHistory(next);
    state.mealHistory = next;
    console.log('Meal plan saved to history');
  } catch (e) { console.error('Failed saving history', e); }
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); el.remove(); }, 2500);
}
function altImageFor(name, current) {
  const map = {
    'chia pudding': 'https://images.unsplash.com/photo-1553456558-aff63285bdd1?q=80&w=1200&auto=format&fit=crop',
    'greek yogurt parfait': 'https://images.unsplash.com/photo-1467453678174-768ec283a940?q=80&w=1200&auto=format&fit=crop',
    'tofu scramble': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1200&auto=format&fit=crop',
    'quinoa chickpea bowl': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=1200&auto=format&fit=crop',
    'grilled halloumi salad': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=1200&auto=format&fit=crop',
    'lentil soup': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?q=80&w=1200&auto=format&fit=crop',
    'vegetable stir-fry with tofu': 'https://images.unsplash.com/photo-1526318472351-c75fcf070305?q=80&w=1200&auto=format&fit=crop',
    'zucchini noodles with pesto': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200&auto=format&fit=crop',
    'eggplant parmesan (light)': 'https://images.unsplash.com/photo-1506368249639-73a05d6f6488?q=80&w=1200&auto=format&fit=crop',
    'grilled salmon with greens': 'https://images.unsplash.com/photo-1514517220036-db3ab8b7b814?q=80&w=1200&auto=format&fit=crop',
    'chicken & veg bowl': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1200&auto=format&fit=crop',
  };
  const key = name.toLowerCase();
  if (map[key] && map[key] !== current) return map[key];
  return current;
}
function formatQty(q) {
  if (Math.abs(q - Math.round(q)) < 1e-6) return Math.round(q);
  return Number(q.toFixed(2));
}
function humanizeItem(item, qty, unit) {
  const lower = item.toLowerCase();
  const u = unit.toLowerCase();

  const produceWeights = {
    'eggplant': 300,
    'aubergine': 300,
    'zucchini': 200,
    'courgette': 200,
    'cabbage': 900,
    'lettuce': 400,
    'carrot': 70,
    'tomato': 120,
    'cucumber': 300,
    'bell pepper': 150,
    'broccoli': 300,
    'celery': 400,
    'lemon': 120,
    'onion': 110,
    'garlic': 5
  };

  function fractionize(n) {
    const quarters = Math.round(n * 4) / 4;
    const whole = Math.floor(quarters);
    const frac = quarters - whole;
    const fracStr = frac === 0 ? '' : frac === 0.25 ? '1/4' : frac === 0.5 ? '1/2' : '3/4';
    if (whole === 0) return fracStr;
    if (!fracStr) return String(whole);
    return `${whole} ${fracStr}`;
  }

  if (u === 'g') {
    const key = Object.keys(produceWeights).find(k => lower.includes(k));
    if (key) {
      const per = produceWeights[key];
      const count = qty / per;
      const phr = fractionize(count);
      const name = lower.includes('lettuce') ? (phr === '1' ? 'whole lettuce' : 'lettuce') : item;
      return `${phr} ${name}`.trim();
    }
  }

  if (u === 'pc') return `${formatQty(qty)} ${item}`;

  if (u === 'stalk') return `${formatQty(qty)} ${qty > 1 ? 'stalks' : 'stalk'} ${item}`;
  if (u === 'cloves') return `${formatQty(qty)} ${qty > 1 ? 'cloves' : 'clove'} ${item}`;

  if (lower.includes('almond milk')) {
    const cups = qty / 240;
    return `${fractionize(cups)} cup almond milk`;
  }
  if (lower.includes('yogurt') || lower.includes('greek yogurt')) {
    const cups = qty / 200;
    return `${fractionize(cups)} cup yogurt`;
  }
  if (lower.includes('chia')) {
    const tbsp = qty / 30;
    return `${fractionize(tbsp)} tbsp chia seeds`;
  }

  return `${formatQty(qty)} ${u} ${item}`;
}

// Init
showPage('auth');

// Prune diet options in UI to only the allowed set
(function pruneDietOptions(){
  const sel = document.getElementById('dietType');
  if (!sel) return;
  const allowed = new Set(['balanced','vegan','vegetarian','keto']);
  Array.from(sel.options).forEach(o => { if (!allowed.has(o.value)) o.remove(); });
})();
