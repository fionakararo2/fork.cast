// =============================================================
// FORK.CAST — app.js  (database-backed, all bugs fixed)
// =============================================================

const API = '';   // same origin — server serves the frontend

// ---- STATE --------------------------------------------------
const state = {
  user: null,          // { id, email, displayName }
  prefs: null,
  plan: null,
  favorites: new Set(),
  savedMeals: null,
  planList: [],
};

// ---- PAGE ROUTER --------------------------------------------
const pages = {
  auth:        document.getElementById('page-auth'),
  preferences: document.getElementById('page-preferences'),
  plan:        document.getElementById('page-plan'),
  shopping:    document.getElementById('page-shopping'),
  database:    document.getElementById('page-database'),
};

function showPage(key) {
  Object.values(pages).forEach(p => p.classList.add('hidden'));
  pages[key].classList.remove('hidden');
  const logoutBtn   = document.getElementById('logoutBtn');
  const databaseBtn = document.getElementById('databaseBtn');
  if (key === 'auth') {
    logoutBtn.classList.add('hidden');
    databaseBtn.classList.add('hidden');
  } else {
    logoutBtn.classList.remove('hidden');
    if (state.user && !state.user.guest) databaseBtn.classList.remove('hidden');
    else databaseBtn.classList.add('hidden');
  }
  if (key === 'database') loadDatabasePage();
}

// ---- API HELPERS --------------------------------------------
async function apiFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

async function logActivity(action, details = '') {
  if (!state.user || state.user.guest) return;
  await apiFetch('/api/activity/log', 'POST', { userId: state.user.id, action, details });
}

// ---- AUTH ---------------------------------------------------
const loginForm  = document.getElementById('loginForm');
const signupBtn  = document.getElementById('signupBtn');
const guestBtn   = document.getElementById('guestBtn');
const logoutBtn  = document.getElementById('logoutBtn');
const databaseBtn = document.getElementById('databaseBtn');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  if (!email || !password) { alert('Please enter both email and password.'); return; }

  const data = await apiFetch('/api/auth/login', 'POST', { email, password });
  if (!data.success) { alert(data.error || 'Login failed.'); return; }

  state.user      = data.user;
  state.favorites = new Set(await loadFavoritesFromDB());
  await logActivity('login_success', 'User logged in');

  const prefsData = await apiFetch(`/api/preferences/${state.user.id}`);
  if (prefsData.prefs) {
    state.prefs = prefsData.prefs;
    const planData = await apiFetch(`/api/plans/${state.user.id}`);
    if (planData.plan) {
      state.plan = planData.plan;
      const isWeek = planData.timePeriod === 'week';
      renderTableForPlan(state.plan, state.prefs, isWeek);
      showPage('plan');
      return;
    }
  }
  showPage('preferences');
});

signupBtn.addEventListener('click', async () => {
  const email    = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  if (!email || !password) { alert('Please enter an email and password to sign up.'); return; }

  const data = await apiFetch('/api/auth/signup', 'POST', { email, password });
  if (!data.success) { alert(data.error || 'Signup failed.'); return; }

  state.user      = { id: data.userId, email, displayName: data.displayName };
  state.favorites = new Set();
  await logActivity('signup_success', 'Account created');
  alert('Account created! You are now signed in.');
  showPage('preferences');
});

guestBtn.addEventListener('click', () => {
  state.user      = { guest: true, email: 'guest' };
  state.favorites = new Set();
  showPage('preferences');
});

logoutBtn.addEventListener('click', async () => {
  await logActivity('logout', 'User logged out');
  state.user = null; state.prefs = null; state.plan = null;
  state.favorites = new Set(); state.savedMeals = null;
  showPage('auth');
});

databaseBtn.addEventListener('click', () => showPage('database'));

// ---- FAVORITES (DB-backed) ----------------------------------
async function loadFavoritesFromDB() {
  if (!state.user || state.user.guest) return [];
  const data = await apiFetch(`/api/favorites/${state.user.id}`);
  return data.favorites || [];
}

async function saveFavoritesToDB() {
  if (!state.user || state.user.guest) return;
  await apiFetch('/api/favorites/save', 'POST', {
    userId: state.user.id,
    favorites: Array.from(state.favorites)
  });
}

function isFav(name) { return state.favorites.has(name); }
async function toggleFav(name) {
  if (state.favorites.has(name)) state.favorites.delete(name);
  else state.favorites.add(name);
  await saveFavoritesToDB();
}

// ---- PREFERENCES FORM ---------------------------------------
const preferencesForm = document.getElementById('preferencesForm');

// FIX: bind missing back arrow on preferences page
const prefPrevArrowBtn = document.getElementById('prefPrevArrowBtn');
const prefNextArrowBtn = document.getElementById('prefNextArrowBtn');
if (prefPrevArrowBtn) prefPrevArrowBtn.addEventListener('click', () => showPage('auth'));
if (prefNextArrowBtn) prefNextArrowBtn.addEventListener('click', () => {
  const form = document.getElementById('preferencesForm');
  if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
});

preferencesForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dietType    = document.getElementById('dietType').value;
  const mealsPerDay = clampInt(parseInt(document.getElementById('mealsPerDay').value, 10), 1, 8);
  const allergies   = toList(document.getElementById('allergies').value);
  const exclusions  = toList(document.getElementById('exclusions').value);
  const timePeriod  = document.getElementById('timePeriod')?.value || 'today';

  const allToggle = document.getElementById('mtAll');
  const mtChecks  = Array.from(document.querySelectorAll('#mealTypeGroup .mt'));
  let mealTypes   = mtChecks.filter(c => c.checked).map(c => c.value);
  if (allToggle && allToggle.checked) mealTypes = ['breakfast','lunch','dinner','snack'];
  if (!mealTypes.length) { alert('Please select at least one meal type'); return; }

  state.prefs = { dietType, mealsPerDay, allergies, exclusions, timePeriod, mealTypes };

  if (!state.user.guest) {
    await apiFetch('/api/preferences/save', 'POST', { userId: state.user.id, prefs: state.prefs });
  }

  if (timePeriod === 'week') {
    startWeekTwoPhase(state.prefs);
  } else {
    state.plan = generatePlan(state.prefs, timePeriod, mealTypes);
    renderTableForPlan(state.plan, state.prefs, false);
    if (!state.user.guest) {
      await apiFetch('/api/plans/save', 'POST', { userId: state.user.id, plan: state.plan, timePeriod });
    }
  }
  toast('✓ Your meal plan is ready!');
  showPage('plan');
});

// ---- PLAN NAVIGATION ----------------------------------------
document.getElementById('backToPrefsBtn').addEventListener('click',  () => showPage('preferences'));
document.getElementById('editPrefsBtn').addEventListener('click',    () => showPage('preferences'));
document.getElementById('toShoppingBtn').addEventListener('click',   () => { renderShoppingListPage(); showPage('shopping'); });
document.getElementById('backToPlanBtn').addEventListener('click',   () => showPage('plan'));
document.getElementById('downloadListBtn').addEventListener('click', downloadShoppingList);
document.getElementById('backToPlanFromDbBtn').addEventListener('click', () => showPage('plan'));

const planPrevArrowBtn = document.getElementById('planPrevArrowBtn');
const planNextArrowBtn = document.getElementById('planNextArrowBtn');
const shopPrevArrowBtn = document.getElementById('shopPrevArrowBtn');
const dbPrevArrowBtn   = document.getElementById('dbPrevArrowBtn');   // FIX: was never bound

if (planPrevArrowBtn) planPrevArrowBtn.addEventListener('click', () => showPage('preferences'));
if (planNextArrowBtn) planNextArrowBtn.addEventListener('click', () => { renderShoppingListPage(); showPage('shopping'); });
if (shopPrevArrowBtn) shopPrevArrowBtn.addEventListener('click', () => showPage('plan'));
if (dbPrevArrowBtn)   dbPrevArrowBtn.addEventListener('click',   () => showPage('plan')); // FIX

// ---- DATABASE PAGE ------------------------------------------
async function loadDatabasePage() {
  if (!state.user || state.user.guest) { showPage('auth'); return; }

  const profileData = await apiFetch(`/api/auth/profile/${state.user.id}`);
  const profile     = profileData.profile || {};
  document.getElementById('userProfileInfo').innerHTML = `
    <p><strong>Name:</strong> ${profile.display_name || '-'}</p>
    <p><strong>Email:</strong> ${profile.email}</p>
    <p><strong>Member since:</strong> ${profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</p>
    <p><strong>Bio:</strong> ${profile.bio || 'No bio set'}</p>
  `;

  document.getElementById('dbStats').innerHTML = `
    <p><strong>Your Favorites:</strong> ${state.favorites.size}</p>
    <p><strong>Saved Plan:</strong> ${state.plan ? 'Yes' : 'None'}</p>
    <p><strong>Diet Type:</strong> ${state.prefs ? pretty(state.prefs.dietType) : '-'}</p>
  `;

  const actData = await apiFetch(`/api/activity/${state.user.id}`);
  const acts    = actData.activity || [];
  document.getElementById('activityLog').innerHTML = acts.length
    ? acts.map(a => `<div class="activity-item"><strong>${a.action}</strong> — ${new Date(a.created_at).toLocaleString()}<br><small>${a.details}</small></div>`).join('')
    : '<p>No recent activity.</p>';
}

document.getElementById('editProfileBtn').addEventListener('click', async () => {
  const name = prompt('Display Name:', state.user.displayName || '');
  if (name === null) return;
  const bio = prompt('Bio:', '');
  if (bio === null) return;
  const data = await apiFetch('/api/auth/update-profile', 'PUT', { userId: state.user.id, displayName: name, bio });
  if (data.success) { state.user.displayName = name; alert('Profile updated!'); loadDatabasePage(); }
  else alert('Error updating profile.');
});

document.getElementById('resetPasswordBtn').addEventListener('click', async () => {
  const oldPw  = prompt('Current password:');
  if (!oldPw) return;
  const newPw  = prompt('New password (min 6 chars):');
  if (!newPw || newPw.length < 6) { alert('Password must be at least 6 characters.'); return; }
  const confPw = prompt('Confirm new password:');
  if (newPw !== confPw) { alert('Passwords do not match.'); return; }

  const data = await apiFetch('/api/auth/change-password', 'PUT', { userId: state.user.id, oldPassword: oldPw, newPassword: newPw });
  if (data.success) alert('Password changed successfully!');
  else alert(data.error || 'Failed to change password.');
});

document.getElementById('exportDataBtn').addEventListener('click', async () => {
  const profileData = await apiFetch(`/api/auth/profile/${state.user.id}`);
  const planData    = await apiFetch(`/api/plans/${state.user.id}`);
  const prefsData   = await apiFetch(`/api/preferences/${state.user.id}`);
  const favsData    = await apiFetch(`/api/favorites/${state.user.id}`);

  const exportObj = {
    profile:     profileData.profile,
    preferences: prefsData.prefs,
    favorites:   favsData.favorites,
    plan:        planData.plan,
    exportDate:  new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `forkcast_export_${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  await logActivity('data_exported', 'User exported data');
});

document.getElementById('clearCacheBtn').addEventListener('click', async () => {
  if (!confirm('This clears your saved plan and favorites. Continue?')) return;
  await apiFetch('/api/plans/save',     'POST', { userId: state.user.id, plan: null,  timePeriod: 'today' });
  await apiFetch('/api/favorites/save', 'POST', { userId: state.user.id, favorites: [] });
  state.favorites = new Set(); state.plan = null; state.savedMeals = null;
  await logActivity('cache_cleared', 'User cleared cache');
  alert('Cleared!'); showPage('preferences');
});

// ---- MEAL TYPE CHECKBOXES -----------------------------------
(function bindMealTypeCheckboxes() {
  const group = document.getElementById('mealTypeGroup');
  if (!group) return;
  const all   = document.getElementById('mtAll');
  const boxes = Array.from(group.querySelectorAll('.mt'));
  if (all) all.addEventListener('change', () => boxes.forEach(c => c.checked = all.checked));
  boxes.forEach(c => c.addEventListener('change', () => {
    if (!boxes.some(x => x.checked)) { c.checked = true; toast('Select at least one meal type'); }
    if (all) all.checked = boxes.every(x => x.checked);
  }));
})();

// ---- RECIPE DATA --------------------------------------------
function baseRecipes() {
  return [
    { name: 'Chia Pudding', diet: ['vegan','vegetarian','balanced','keto'],
      img: 'https://images.unsplash.com/photo-1517673132405-37045b9cefcb?q=80&w=800&auto=format&fit=crop',
      macros: { calories:320, carbs:18, protein:12, fat:22 }, type:['breakfast','snack'],
      ingredients:[{item:'chia seeds',qty:30,unit:'g'},{item:'almond milk',qty:240,unit:'ml'},{item:'vanilla',qty:1,unit:'tsp'},{item:'berries',qty:80,unit:'g'}],
      instructions:['Combine chia seeds, almond milk, and vanilla in a jar.','Stir well and refrigerate at least 2 hours.','Top with berries before serving.'] },
    { name: 'Greek Yogurt Parfait', diet: ['vegetarian','balanced'],
      img: 'https://images.unsplash.com/photo-1514996937319-344454492b37?q=80&w=800&auto=format&fit=crop',
      macros: { calories:280, carbs:32, protein:18, fat:8 }, type:['breakfast','snack'],
      ingredients:[{item:'greek yogurt',qty:200,unit:'g'},{item:'granola',qty:40,unit:'g'},{item:'berries',qty:80,unit:'g'},{item:'honey',qty:1,unit:'tbsp'}],
      instructions:['Layer yogurt in a glass.','Add granola and berries.','Drizzle with honey.'] },
    { name: 'Tofu Scramble', diet: ['vegan','vegetarian','balanced'],
      img: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?q=80&w=800&auto=format&fit=crop',
      macros: { calories:290, carbs:10, protein:22, fat:18 }, type:['breakfast','lunch'],
      ingredients:[{item:'tofu',qty:200,unit:'g'},{item:'turmeric',qty:0.5,unit:'tsp'},{item:'spinach',qty:60,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'onion',qty:0.5,unit:'pc'}],
      instructions:['Crumble tofu into a pan with a little oil.','Add turmeric, onion, and cook until fragrant.','Stir in tomato and spinach; cook until wilted.','Season and serve.'] },
    { name: 'Quinoa Chickpea Bowl', diet: ['vegan','vegetarian','balanced'],
      img: 'https://images.unsplash.com/photo-1550409175-7d3c1de93c89?q=80&w=800&auto=format&fit=crop',
      macros: { calories:520, carbs:68, protein:22, fat:14 }, type:['lunch','dinner'],
      ingredients:[{item:'quinoa',qty:75,unit:'g'},{item:'chickpeas',qty:120,unit:'g'},{item:'spinach',qty:60,unit:'g'},{item:'cucumber',qty:0.5,unit:'pc'},{item:'lemon',qty:0.5,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'}],
      instructions:['Cook quinoa per package.','Rinse chickpeas; chop cucumber.','Combine all with olive oil and lemon.','Season with salt and pepper.'] },
    { name: 'Lentil Soup', diet: ['vegan','vegetarian','balanced'],
      img: 'https://images.unsplash.com/photo-1604908176997-4316511f4b32?q=80&w=800&auto=format&fit=crop',
      macros: { calories:360, carbs:48, protein:20, fat:8 }, type:['lunch','dinner'],
      ingredients:[{item:'lentils',qty:90,unit:'g'},{item:'carrot',qty:1,unit:'pc'},{item:'celery',qty:1,unit:'stalk'},{item:'onion',qty:0.5,unit:'pc'},{item:'tomato',qty:1,unit:'pc'}],
      instructions:['Sauté onion, carrot, and celery in a pot.','Add lentils and water/stock; simmer 20-25 min.','Stir in chopped tomato; season to taste.'] },
    { name: 'Zucchini Noodles with Pesto', diet: ['vegan','vegetarian','keto'],
      img: 'https://images.unsplash.com/photo-1603048297172-c92544798a04?q=80&w=800&auto=format&fit=crop',
      macros: { calories:380, carbs:14, protein:10, fat:30 }, type:['lunch','dinner'],
      ingredients:[{item:'zucchini',qty:2,unit:'pc'},{item:'basil',qty:20,unit:'g'},{item:'pine nuts',qty:20,unit:'g'},{item:'olive oil',qty:2,unit:'tbsp'},{item:'garlic',qty:1,unit:'cloves'}],
      instructions:['Spiralize zucchini into noodles.','Blend basil, pine nuts, olive oil, and garlic into pesto.','Toss zoodles with pesto; season to taste.'] },
    { name: 'Grilled Salmon with Greens', diet: ['balanced'],
      img: 'https://images.unsplash.com/photo-1553621042-f6e147245754?q=80&w=800&auto=format&fit=crop',
      macros: { calories:520, carbs:8, protein:38, fat:34 }, type:['lunch','dinner'],
      ingredients:[{item:'salmon',qty:180,unit:'g'},{item:'lemon',qty:0.5,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'mixed greens',qty:80,unit:'g'}],
      instructions:['Season salmon; grill or pan-sear until just cooked.','Toss greens with lemon and olive oil.','Serve salmon over the dressed greens.'] },
    { name: 'Chicken & Veg Bowl', diet: ['balanced'],
      img: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?q=80&w=800&auto=format&fit=crop',
      macros: { calories:560, carbs:42, protein:42, fat:20 }, type:['lunch','dinner'],
      ingredients:[{item:'chicken breast',qty:180,unit:'g'},{item:'brown rice',qty:75,unit:'g'},{item:'broccoli',qty:120,unit:'g'},{item:'carrot',qty:1,unit:'pc'},{item:'soy sauce',qty:1,unit:'tbsp'}],
      instructions:['Cook rice per package.','Sauté chicken until browned; add vegetables and cook through.','Splash with soy sauce; serve over rice.'] },
    { name: 'Ribeye Steak', diet: ['keto'],
      img: 'https://images.unsplash.com/photo-1604908554049-1d055f3ad0fb?q=80&w=800&auto=format&fit=crop',
      macros: { calories:700, carbs:0, protein:55, fat:50 }, type:['dinner'],
      ingredients:[{item:'ribeye steak',qty:300,unit:'g'},{item:'salt',qty:1,unit:'tsp'},{item:'butter',qty:10,unit:'g'}],
      instructions:['Season steak generously.','Sear in hot pan with butter to desired doneness.','Rest and serve.'] },
    { name: 'Bacon & Eggs', diet: ['keto'],
      img: '',
      macros: { calories:420, carbs:2, protein:24, fat:34 }, type:['breakfast','snack'],
      ingredients:[{item:'bacon',qty:100,unit:'g'},{item:'eggs',qty:3,unit:'pc'},{item:'butter',qty:5,unit:'g'}],
      instructions:['Cook bacon until crispy.','Fry eggs in butter to preference.','Serve together.'] },
    { name: 'Avocado Toast', diet: ['vegan','vegetarian','balanced'],
      img: '',
      macros: { calories:310, carbs:28, protein:8, fat:18 }, type:['breakfast','snack'],
      ingredients:[{item:'bread',qty:2,unit:'pc'},{item:'avocado',qty:1,unit:'pc'},{item:'lemon',qty:0.25,unit:'pc'},{item:'salt',qty:0.5,unit:'tsp'}],
      instructions:['Toast bread.','Mash avocado with lemon and salt.','Spread on toast.'] },
    { name: 'Vegetable Stir-Fry with Tofu', diet: ['vegan','vegetarian','balanced'],
      img: 'https://images.unsplash.com/photo-1617093727343-374698b1e338?q=80&w=800&auto=format&fit=crop',
      macros: { calories:480, carbs:42, protein:26, fat:22 }, type:['lunch','dinner'],
      ingredients:[{item:'tofu',qty:200,unit:'g'},{item:'broccoli',qty:120,unit:'g'},{item:'bell pepper',qty:1,unit:'pc'},{item:'soy sauce',qty:1,unit:'tbsp'},{item:'garlic',qty:2,unit:'cloves'},{item:'ginger',qty:1,unit:'tsp'}],
      instructions:['Stir-fry tofu in a hot pan until edges crisp.','Add broccoli and bell pepper; cook until tender-crisp.','Stir in garlic, ginger, and soy sauce; toss and serve.'] },
    { name: 'Scrambled Eggs', diet: ['vegetarian','balanced','keto'],
      img: '',
      macros: { calories:280, carbs:2, protein:18, fat:20 }, type:['breakfast'],
      ingredients:[{item:'eggs',qty:3,unit:'pc'},{item:'butter',qty:8,unit:'g'},{item:'salt',qty:0.5,unit:'tsp'}],
      instructions:['Whisk eggs with salt.','Melt butter in pan on low heat.','Add eggs and stir gently until softly set.'] },
    { name: 'Mushroom Risotto', diet: ['vegetarian','balanced'],
      img: '',
      macros: { calories:490, carbs:62, protein:14, fat:18 }, type:['dinner'],
      ingredients:[{item:'arborio rice',qty:100,unit:'g'},{item:'mushrooms',qty:150,unit:'g'},{item:'parmesan',qty:30,unit:'g'},{item:'vegetable broth',qty:400,unit:'ml'},{item:'onion',qty:0.5,unit:'pc'}],
      instructions:['Sauté onion and mushrooms.','Add rice and toast briefly.','Add broth ladle by ladle, stirring until absorbed.','Finish with parmesan.'] },
    { name: 'Pork Chops', diet: ['keto'],
      img: '',
      macros: { calories:520, carbs:0, protein:40, fat:38 }, type:['dinner'],
      ingredients:[{item:'pork chops',qty:300,unit:'g'},{item:'salt',qty:1,unit:'tsp'},{item:'butter',qty:10,unit:'g'}],
      instructions:['Season chops well.','Sear in butter on high heat 3-4 min per side.','Rest before serving.'] },
    { name: 'Vegan Buddha Bowl', diet: ['vegan'],
      img: '',
      macros: { calories:460, carbs:55, protein:18, fat:16 }, type:['lunch','dinner'],
      ingredients:[{item:'brown rice',qty:80,unit:'g'},{item:'chickpeas',qty:100,unit:'g'},{item:'spinach',qty:60,unit:'g'},{item:'avocado',qty:0.5,unit:'pc'},{item:'tahini',qty:1,unit:'tbsp'}],
      instructions:['Cook rice.','Roast chickpeas at 200°C for 20 min.','Assemble bowl with rice, chickpeas, spinach, avocado.','Drizzle tahini on top.'] },
    { name: 'Caprese Salad', diet: ['vegetarian','balanced'],
      img: '',
      macros: { calories:320, carbs:6, protein:18, fat:24 }, type:['lunch','snack'],
      ingredients:[{item:'tomato',qty:2,unit:'pc'},{item:'mozzarella',qty:100,unit:'g'},{item:'basil',qty:10,unit:'g'},{item:'olive oil',qty:1,unit:'tbsp'}],
      instructions:['Slice tomatoes and mozzarella.','Alternate layers on a plate.','Top with basil and olive oil.'] },
    { name: 'Keto Egg Salad', diet: ['keto','vegetarian'],
      img: '',
      macros: { calories:380, carbs:3, protein:22, fat:30 }, type:['lunch','snack'],
      ingredients:[{item:'eggs',qty:4,unit:'pc'},{item:'mayonnaise',qty:2,unit:'tbsp'},{item:'mustard',qty:1,unit:'tsp'},{item:'salt',qty:0.5,unit:'tsp'}],
      instructions:['Hard boil eggs; peel and chop.','Mix with mayo, mustard, and salt.','Serve chilled.'] },
    { name: 'Red Lentil Dal', diet: ['vegan','vegetarian'],
      img: '',
      macros: { calories:410, carbs:52, protein:22, fat:10 }, type:['dinner'],
      ingredients:[{item:'red lentils',qty:100,unit:'g'},{item:'coconut milk',qty:200,unit:'ml'},{item:'tomato',qty:1,unit:'pc'},{item:'cumin',qty:1,unit:'tsp'},{item:'turmeric',qty:0.5,unit:'tsp'}],
      instructions:['Sauté spices briefly.','Add lentils, tomato, and coconut milk.','Simmer 20 min until thick; season to taste.'] },
    { name: 'Grilled Chicken Salad', diet: ['balanced'],
      img: '',
      macros: { calories:420, carbs:12, protein:36, fat:22 }, type:['lunch','dinner'],
      ingredients:[{item:'chicken breast',qty:150,unit:'g'},{item:'mixed greens',qty:80,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'cucumber',qty:0.5,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'}],
      instructions:['Season and grill chicken.','Slice and place over greens.','Add tomato and cucumber; drizzle with olive oil.'] },
  ];
}

// FIX: seedRecipes only once (check flag to avoid overwriting on every load)
let RECIPES = [];
function seedRecipesIfNeeded() {
  return baseRecipes();
}
RECIPES = seedRecipesIfNeeded();

// ---- PLAN GENERATION ----------------------------------------
function uniqueByName(arr) {
  const seen = new Set(); const res = [];
  for (const r of arr) { if (!seen.has(r.name)) { seen.add(r.name); res.push(r); } }
  return res;
}
function containsAny(ingredient, avoidSet) {
  const token = String(ingredient).toLowerCase();
  for (const a of avoidSet) { if (a && token.includes(String(a).toLowerCase())) return true; }
  return false;
}
function clampInt(n, min, max) { return Math.max(min, Math.min(max, isNaN(n) ? min : n)); }
function toList(v) { return (v||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean); }
function pretty(key) { return (key||'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }

function buildPool(prefs) {
  const { dietType, allergies, exclusions } = prefs;
  const avoid = new Set([...(allergies||[]), ...(exclusions||[])]);
  let pool = RECIPES
    .filter(r => r.diet.includes(dietType))
    .filter(r => (r.ingredients||[]).every(i => !containsAny(typeof i==='string'?i:i.item, avoid)));
  pool = uniqueByName(pool);
  for (let i = pool.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  return pool;
}

function generatePlan(prefs) {
  const pool     = buildPool(prefs);
  const dayCount = prefs.timePeriod === 'week' ? 7 : 1;
  const total    = prefs.mealsPerDay * dayCount;
  const picked   = pool.slice(0, Math.min(pool.length, total));
  const days = [];
  for (let d=0; d<dayCount; d++) {
    const slice = picked.slice(d*prefs.mealsPerDay, (d+1)*prefs.mealsPerDay);
    days.push({ day:d+1, meals:slice });
  }
  if (prefs.timePeriod === 'week') return { days };
  return { meals: days[0].meals };
}

function startWeekTwoPhase(prefs) {
  state.plan = generatePlan(prefs);
  renderTableForPlan(state.plan, prefs, true);
  if (!state.user.guest) {
    apiFetch('/api/plans/save', 'POST', { userId: state.user.id, plan: state.plan, timePeriod: 'week' });
  }
}

// ---- RENDER -------------------------------------------------
function mealTypesFromPrefs(prefs) {
  const t = prefs?.mealTypes?.length ? prefs.mealTypes : ['breakfast','lunch','dinner','snack'];
  return ['breakfast','lunch','dinner','snack'].filter(x=>t.includes(x));
}
function allocateMealsToSlots(meals, selectedTypes) {
  const slots = {}; selectedTypes.forEach(t=>slots[t]=null);
  let i=0; for (const st of selectedTypes) { if (i<meals.length) slots[st]=meals[i++]; }
  return slots;
}

function renderTableForPlan(plan, prefs, isWeek) {
  const container = document.getElementById('mealsContainer');
  const summary   = document.getElementById('planSummary');
  container.innerHTML = '';

  // FIX: guard against null plan
  if (!plan) { summary.textContent = 'No plan found.'; return; }

  const selectedTypes = mealTypesFromPrefs(prefs);

  // Toolbar
  let toolbar = document.getElementById('planTableToolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'planTableToolbar';
    toolbar.className = 'plan-toolbar';
    container.parentNode.insertBefore(toolbar, container);
  }
  toolbar.innerHTML = `
    <div class="toolbar-row">
      <div class="left">
        <button id="btnShowFavsTable" class="btn small">Favorites</button>
      </div>
      <div class="right">
        <span id="favCountTable" class="muted">Favorites: ${state.favorites.size}</span>
      </div>
    </div>`;
  document.getElementById('btnShowFavsTable').onclick = renderFavoritesView;

  const table = document.createElement('table');
  table.className = 'meal-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Day</th>${selectedTypes.map(t=>`<th>${pretty(t)}</th>`).join('')}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  const rows = isWeek ? plan.days : [{ day:1, meals: plan.meals, label:'Today' }];
  rows.forEach((dayObj, idx) => {
    const slots = allocateMealsToSlots(dayObj.meals || [], selectedTypes);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="day-col">${dayObj.label || 'Day ' + (idx+1)}</td>` +
      selectedTypes.map(t => {
        const m = slots[t];
        if (!m) return `<td class="empty">—</td>`;
        const liked = isFav(m.name);
        const steps = (m.instructions||[]).map(s=>`<li>${s}</li>`).join('');
        const ing   = (m.ingredients||[]).map(i=>typeof i==='string'?i:i.item).join(', ');
        return `<td><div class="cell-meal">
          <div class="cell-top">
            <div class="cell-name">${m.name}</div>
            <div>
              <button class="cell-like" data-name="${m.name}" aria-pressed="${liked}">${liked?'♥':'♡'}</button>
              <button class="cell-save">↓</button>
              <button class="cell-toggle">Details</button>
            </div>
          </div>
          <div class="cell-macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
          <div class="cell-details">
            <div class="muted">Ingredients: ${ing}</div>
            <ol class="instructions">${steps}</ol>
          </div>
        </div></td>`;
      }).join('');
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  summary.textContent = isWeek ? 'Weekly plan' : `Diet: ${pretty(prefs.dietType)} • Meals: ${prefs.mealsPerDay}`;

  // Bind toggles
  container.querySelectorAll('.cell-toggle').forEach(btn =>
    btn.addEventListener('click', () => btn.closest('.cell-meal').classList.toggle('open')));

  // Bind likes
  container.querySelectorAll('.cell-like').forEach(btn =>
    btn.addEventListener('click', async () => {
      const name = btn.getAttribute('data-name');
      await toggleFav(name);
      btn.textContent = isFav(name) ? '♥' : '♡';
      btn.setAttribute('aria-pressed', String(isFav(name)));
      document.querySelectorAll('#favCountTable, #favCount').forEach(el => el.textContent = `Favorites: ${state.favorites.size}`);
    }));

  // Bind save buttons
  container.querySelectorAll('.cell-save').forEach(btn =>
    btn.addEventListener('click', async () => {
      state.savedMeals = { timePeriod: prefs.timePeriod, prefs, plan: JSON.parse(JSON.stringify(plan)) };
      if (!state.user.guest) {
        await apiFetch('/api/plans/save', 'POST', { userId: state.user.id, plan, timePeriod: prefs.timePeriod || 'today' });
      }
      toast('✓ Meal plan saved!');
      btn.classList.add('saved'); setTimeout(() => btn.classList.remove('saved'), 1000);
    }));

  // Build shopping list
  buildShoppingList(plan, isWeek, selectedTypes);
}

function buildShoppingList(plan, isWeek, selectedTypes) {
  const ingredientMap = new Map();
  const rows = isWeek ? plan.days : [{ meals: plan.meals }];
  rows.forEach(dayObj => {
    const slots = allocateMealsToSlots(dayObj.meals||[], selectedTypes);
    Object.values(slots).forEach(m => {
      if (!m) return;
      (m.ingredients||[]).forEach(i => {
        const item    = typeof i === 'string' ? { item:i, qty:1, unit:'x' } : i;
        const key     = `${item.item}__${item.unit}`;
        const current = ingredientMap.get(key) || { item:item.item, qty:0, unit:item.unit };
        current.qty  += item.qty; ingredientMap.set(key, current);
      });
    });
  });
  state.planList = [...ingredientMap.values()].sort((a,b)=>a.item.localeCompare(b.item))
    .map(({item,qty,unit}) => `${Number(qty.toFixed(2))} ${unit} ${item}`);
}

function renderFavoritesView() {
  const container = document.getElementById('mealsContainer');
  container.innerHTML = '';
  const favMeals = RECIPES.filter(r => state.favorites.has(r.name));

  // FIX: show empty state if no favorites
  if (favMeals.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:20px;">No favorites yet. Heart a meal to save it here!</p>';
    return;
  }

  favMeals.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'meal-card';
    const steps = (m.instructions||[]).map(s=>`<li>${s}</li>`).join('');
    const ing   = (m.ingredients||[]).map(i=>typeof i==='string'?i:i.item).join(', ');
    card.innerHTML = `<div class="content">
      <h4>${idx+1}. ${m.name} <button class="like-btn" data-name="${m.name}">♥</button></h4>
      <div class="macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
      <div class="muted">Ingredients: ${ing}</div>
      <div class="details">
        <button class="details-toggle" type="button">View recipe</button>
        <div class="details-content"><ol class="instructions">${steps}</ol></div>
      </div>
    </div>`;
    card.querySelector('.details-toggle').addEventListener('click', () => card.querySelector('.details').classList.toggle('open'));
    card.querySelector('.like-btn').addEventListener('click', async () => {
      await toggleFav(m.name); card.remove();
      document.querySelectorAll('#favCountTable, #favCount').forEach(el => el.textContent = `Favorites: ${state.favorites.size}`);
    });
    container.appendChild(card);
  });
}

function renderShoppingListPage() {
  const listEl = document.getElementById('shoppingListPage');
  listEl.innerHTML = '';
  // FIX: show empty state message
  if (!state.planList || state.planList.length === 0) {
    listEl.innerHTML = '<li style="color:var(--muted)">Generate a meal plan first to see your shopping list.</li>';
    return;
  }
  state.planList.forEach(text => {
    const li = document.createElement('li'); li.textContent = text; listEl.appendChild(li);
  });
}

function downloadShoppingList() {
  const lines   = state.planList && state.planList.length ? state.planList : ['No items'];
  const blob    = new Blob([lines.join('\n')], { type:'text/plain' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = 'forkcast-shopping-list.txt';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); el.remove(); }, 2500);
}

// FIX: prune diet dropdown to only supported diets
(function pruneDietOptions() {
  const sel     = document.getElementById('dietType');
  if (!sel) return;
  const allowed = new Set(['balanced','vegan','vegetarian','keto']);
  Array.from(sel.options).forEach(o => { if (!allowed.has(o.value)) o.remove(); });
})();

// ---- INIT ---------------------------------------------------
showPage('auth');
