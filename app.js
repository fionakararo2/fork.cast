// =============================================================
// FORK.CAST — app.js  (database-backed, all bugs fixed, expanded recipes)
// =============================================================

const API = '';

const state = {
  user: null,
  prefs: null,
  plan: null,
  favorites: new Set(),
  savedMeals: null,
  planList: [],
};

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
const loginForm   = document.getElementById('loginForm');
const signupBtn   = document.getElementById('signupBtn');
const guestBtn    = document.getElementById('guestBtn');
const logoutBtn   = document.getElementById('logoutBtn');
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

// ---- FAVORITES ----------------------------------------------
async function loadFavoritesFromDB() {
  if (!state.user || state.user.guest) return [];
  const data = await apiFetch(`/api/favorites/${state.user.id}`);
  return data.favorites || [];
}
async function saveFavoritesToDB() {
  if (!state.user || state.user.guest) return;
  await apiFetch('/api/favorites/save', 'POST', { userId: state.user.id, favorites: Array.from(state.favorites) });
}
function isFav(name) { return state.favorites.has(name); }
async function toggleFav(name) {
  if (state.favorites.has(name)) state.favorites.delete(name);
  else state.favorites.add(name);
  await saveFavoritesToDB();
}

// ---- PREFERENCES FORM ---------------------------------------
const prefPrevArrowBtn = document.getElementById('prefPrevArrowBtn');
const prefNextArrowBtn = document.getElementById('prefNextArrowBtn');
if (prefPrevArrowBtn) prefPrevArrowBtn.addEventListener('click', () => showPage('auth'));
if (prefNextArrowBtn) prefNextArrowBtn.addEventListener('click', () => {
  const form = document.getElementById('preferencesForm');
  if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
});

// FIX: meal type hint only shows on error
(function bindMealTypeCheckboxes() {
  const group = document.getElementById('mealTypeGroup');
  if (!group) return;
  const all   = document.getElementById('mtAll');
  const boxes = Array.from(group.querySelectorAll('.mt'));
  const hint  = document.getElementById('mealTypeHint');
  if (all) all.addEventListener('change', () => boxes.forEach(c => c.checked = all.checked));
  boxes.forEach(c => c.addEventListener('change', () => {
    const anyChecked = boxes.some(x => x.checked);
    if (!anyChecked) {
      c.checked = true;
      if (hint) hint.classList.add('show');
    } else {
      if (hint) hint.classList.remove('show');
    }
    if (all) all.checked = boxes.every(x => x.checked);
  }));
})();

document.getElementById('preferencesForm').addEventListener('submit', async (e) => {
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
  if (!mealTypes.length) {
    const hint = document.getElementById('mealTypeHint');
    if (hint) hint.classList.add('show');
    return;
  }

  state.prefs = { dietType, mealsPerDay, allergies, exclusions, timePeriod, mealTypes };

  if (!state.user.guest) {
    await apiFetch('/api/preferences/save', 'POST', { userId: state.user.id, prefs: state.prefs });
  }

  if (timePeriod === 'week') {
    state.plan = generateWeekPlan(state.prefs);
    renderTableForPlan(state.plan, state.prefs, true);
    if (!state.user.guest) {
      await apiFetch('/api/plans/save', 'POST', { userId: state.user.id, plan: state.plan, timePeriod: 'week' });
    }
  } else {
    state.plan = generateTodayPlan(state.prefs);
    renderTableForPlan(state.plan, state.prefs, false);
    if (!state.user.guest) {
      await apiFetch('/api/plans/save', 'POST', { userId: state.user.id, plan: state.plan, timePeriod: 'today' });
    }
  }
  toast('✓ Your meal plan is ready!');
  showPage('plan');
});

// ---- NAVIGATION ---------------------------------------------
document.getElementById('backToPrefsBtn').addEventListener('click',  () => showPage('preferences'));
document.getElementById('editPrefsBtn').addEventListener('click',    () => showPage('preferences'));
document.getElementById('toShoppingBtn').addEventListener('click',   () => { renderShoppingListPage(); showPage('shopping'); });
document.getElementById('backToPlanBtn').addEventListener('click',   () => showPage('plan'));
document.getElementById('downloadListBtn').addEventListener('click', downloadShoppingList);
document.getElementById('backToPlanFromDbBtn').addEventListener('click', () => showPage('plan'));

const planPrevArrowBtn = document.getElementById('planPrevArrowBtn');
const planNextArrowBtn = document.getElementById('planNextArrowBtn');
const shopPrevArrowBtn = document.getElementById('shopPrevArrowBtn');
const dbPrevArrowBtn   = document.getElementById('dbPrevArrowBtn');

if (planPrevArrowBtn) planPrevArrowBtn.addEventListener('click', () => showPage('preferences'));
if (planNextArrowBtn) planNextArrowBtn.addEventListener('click', () => { renderShoppingListPage(); showPage('shopping'); });
if (shopPrevArrowBtn) shopPrevArrowBtn.addEventListener('click', () => showPage('plan'));
if (dbPrevArrowBtn)   dbPrevArrowBtn.addEventListener('click',   () => showPage('plan'));

// ---- DATABASE PAGE ------------------------------------------
async function loadDatabasePage() {
  if (!state.user || state.user.guest) { showPage('auth'); return; }
  const profileData = await apiFetch(`/api/auth/profile/${state.user.id}`);
  const profile     = profileData.profile || {};
  document.getElementById('userProfileInfo').innerHTML = `
    <p><strong>Name:</strong> ${profile.display_name || '-'}</p>
    <p><strong>Email:</strong> ${profile.email}</p>
    <p><strong>Member since:</strong> ${profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</p>
    <p><strong>Bio:</strong> ${profile.bio || 'No bio set'}</p>`;
  document.getElementById('dbStats').innerHTML = `
    <p><strong>Your Favorites:</strong> ${state.favorites.size}</p>
    <p><strong>Saved Plan:</strong> ${state.plan ? 'Yes' : 'None'}</p>
    <p><strong>Diet Type:</strong> ${state.prefs ? pretty(state.prefs.dietType) : '-'}</p>`;
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
  const oldPw = prompt('Current password:');
  if (!oldPw) return;
  const newPw = prompt('New password (min 6 chars):');
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
  const exportObj   = { profile: profileData.profile, preferences: prefsData.prefs, favorites: favsData.favorites, plan: planData.plan, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `forkcast_export_${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  await logActivity('data_exported', 'User exported data');
});

document.getElementById('clearCacheBtn').addEventListener('click', async () => {
  if (!confirm('This clears your saved plan and favorites. Continue?')) return;
  await apiFetch('/api/plans/save',     'POST', { userId: state.user.id, plan: null, timePeriod: 'today' });
  await apiFetch('/api/favorites/save', 'POST', { userId: state.user.id, favorites: [] });
  state.favorites = new Set(); state.plan = null; state.savedMeals = null;
  await logActivity('cache_cleared', 'User cleared cache');
  alert('Cleared!'); showPage('preferences');
});

// ---- RECIPE DATABASE ----------------------------------------
function buildRecipes() {
  const R = [];

  // Helper to add a recipe
  function add(name, diet, type, cal, carbs, protein, fat, ingredients, instructions, img) {
    R.push({ name, diet, type, macros:{calories:cal,carbs,protein,fat}, ingredients, instructions, img: img||'' });
  }

  // ============================================================
  // BALANCED
  // ============================================================

  // Breakfast
  add('Scrambled Eggs on Toast', ['balanced','vegetarian'], ['breakfast'],
    380, 32, 22, 16,
    [{item:'eggs',qty:3,unit:'pc'},{item:'bread',qty:2,unit:'pc'},{item:'butter',qty:8,unit:'g'},{item:'salt',qty:0.5,unit:'tsp'}],
    ['Whisk eggs with salt.','Melt butter in pan on low heat.','Scramble gently until just set.','Serve on toasted bread.']);

  add('Oatmeal with Banana and Honey', ['balanced','vegan','vegetarian'], ['breakfast'],
    340, 58, 10, 6,
    [{item:'oats',qty:80,unit:'g'},{item:'banana',qty:1,unit:'pc'},{item:'honey',qty:1,unit:'tbsp'},{item:'milk',qty:200,unit:'ml'}],
    ['Cook oats in milk for 5 minutes.','Slice banana on top.','Drizzle with honey and serve.']);

  add('Avocado Toast with Poached Egg', ['balanced','vegetarian'], ['breakfast'],
    420, 28, 18, 24,
    [{item:'bread',qty:2,unit:'pc'},{item:'avocado',qty:1,unit:'pc'},{item:'eggs',qty:2,unit:'pc'},{item:'lemon',qty:0.25,unit:'pc'}],
    ['Toast bread.','Mash avocado with lemon and season.','Poach eggs for 3 minutes.','Top toast with avocado then egg.']);

  add('Greek Yogurt with Granola', ['balanced','vegetarian'], ['breakfast','snack'],
    310, 38, 18, 8,
    [{item:'greek yogurt',qty:200,unit:'g'},{item:'granola',qty:50,unit:'g'},{item:'berries',qty:80,unit:'g'},{item:'honey',qty:1,unit:'tbsp'}],
    ['Spoon yogurt into bowl.','Top with granola and berries.','Drizzle honey and serve.']);

  add('Banana Pancakes', ['balanced','vegetarian'], ['breakfast'],
    410, 52, 14, 14,
    [{item:'banana',qty:2,unit:'pc'},{item:'eggs',qty:2,unit:'pc'},{item:'flour',qty:60,unit:'g'},{item:'milk',qty:100,unit:'ml'},{item:'butter',qty:8,unit:'g'}],
    ['Mash bananas; whisk in eggs and milk.','Fold in flour until smooth.','Cook small pancakes in butter 2 min per side.','Serve with maple syrup if desired.']);

  add('Fruit and Nut Smoothie', ['balanced','vegan','vegetarian'], ['breakfast','snack'],
    320, 44, 10, 10,
    [{item:'banana',qty:1,unit:'pc'},{item:'strawberries',qty:100,unit:'g'},{item:'almond milk',qty:250,unit:'ml'},{item:'peanut butter',qty:1,unit:'tbsp'},{item:'oats',qty:30,unit:'g'}],
    ['Blend all ingredients until smooth.','Pour into a glass and serve immediately.']);

  // Lunch
  add('Grilled Chicken Sandwich', ['balanced'], ['lunch'],
    520, 42, 38, 14,
    [{item:'chicken breast',qty:150,unit:'g'},{item:'bread',qty:2,unit:'pc'},{item:'lettuce',qty:30,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'mayonnaise',qty:1,unit:'tbsp'}],
    ['Season and grill chicken until cooked through.','Slice and layer on bread with lettuce, tomato, and mayo.']);

  add('Tuna Salad Bowl', ['balanced'], ['lunch'],
    390, 14, 36, 18,
    [{item:'tuna',qty:150,unit:'g'},{item:'mixed greens',qty:80,unit:'g'},{item:'cucumber',qty:0.5,unit:'pc'},{item:'tomato',qty:1,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'lemon',qty:0.5,unit:'pc'}],
    ['Drain and flake tuna.','Combine with greens, cucumber, and tomato.','Dress with olive oil and lemon; season.']);

  add('Chicken and Rice Bowl', ['balanced'], ['lunch','dinner'],
    560, 52, 42, 14,
    [{item:'chicken breast',qty:180,unit:'g'},{item:'brown rice',qty:80,unit:'g'},{item:'broccoli',qty:120,unit:'g'},{item:'soy sauce',qty:1,unit:'tbsp'},{item:'garlic',qty:2,unit:'cloves'}],
    ['Cook rice per package.','Sauté chicken with garlic until golden.','Steam broccoli until tender.','Combine in bowl and drizzle with soy sauce.']);

  add('Turkey and Veggie Wrap', ['balanced'], ['lunch'],
    440, 38, 32, 14,
    [{item:'tortilla',qty:1,unit:'pc'},{item:'turkey slices',qty:100,unit:'g'},{item:'avocado',qty:0.5,unit:'pc'},{item:'lettuce',qty:30,unit:'g'},{item:'tomato',qty:0.5,unit:'pc'}],
    ['Lay tortilla flat.','Layer turkey, avocado, lettuce, and tomato.','Roll tightly and slice in half.']);

  add('Beef Stir Fry with Noodles', ['balanced'], ['lunch','dinner'],
    580, 54, 36, 20,
    [{item:'beef strips',qty:180,unit:'g'},{item:'noodles',qty:100,unit:'g'},{item:'bell pepper',qty:1,unit:'pc'},{item:'broccoli',qty:100,unit:'g'},{item:'soy sauce',qty:2,unit:'tbsp'},{item:'ginger',qty:1,unit:'tsp'}],
    ['Cook noodles per package.','Stir-fry beef on high heat until browned.','Add vegetables and cook 3 minutes.','Toss with noodles, soy sauce, and ginger.']);

  // Dinner
  add('Baked Salmon with Sweet Potato', ['balanced'], ['dinner'],
    560, 42, 40, 18,
    [{item:'salmon fillet',qty:200,unit:'g'},{item:'sweet potato',qty:1,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'lemon',qty:0.5,unit:'pc'},{item:'garlic',qty:2,unit:'cloves'}],
    ['Preheat oven to 200°C.','Cube sweet potato; roast with olive oil 25 minutes.','Season salmon with garlic and lemon; bake 15 minutes.','Serve together.']);

  add('Chicken Pasta Bake', ['balanced'], ['dinner'],
    620, 68, 44, 16,
    [{item:'chicken breast',qty:180,unit:'g'},{item:'pasta',qty:100,unit:'g'},{item:'tomato sauce',qty:200,unit:'g'},{item:'mozzarella',qty:60,unit:'g'},{item:'garlic',qty:2,unit:'cloves'}],
    ['Cook pasta until al dente.','Sauté chicken and garlic; add tomato sauce.','Combine with pasta in baking dish.','Top with mozzarella and bake at 190°C for 20 minutes.']);

  add('Beef Burger with Salad', ['balanced'], ['dinner'],
    640, 38, 42, 28,
    [{item:'ground beef',qty:200,unit:'g'},{item:'burger bun',qty:1,unit:'pc'},{item:'lettuce',qty:30,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'onion',qty:0.25,unit:'pc'},{item:'cheddar',qty:30,unit:'g'}],
    ['Form beef into patty; season well.','Grill or pan-fry 4 min per side.','Assemble in bun with lettuce, tomato, onion, and cheese.']);

  add('Grilled Chicken with Roasted Veg', ['balanced'], ['dinner'],
    480, 28, 42, 18,
    [{item:'chicken breast',qty:200,unit:'g'},{item:'zucchini',qty:1,unit:'pc'},{item:'bell pepper',qty:1,unit:'pc'},{item:'onion',qty:0.5,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'}],
    ['Chop vegetables; toss with olive oil and roast at 200°C for 25 minutes.','Season and grill chicken until cooked through.','Serve together.']);

  // Snack
  add('Apple with Peanut Butter', ['balanced','vegan','vegetarian'], ['snack'],
    260, 28, 8, 14,
    [{item:'apple',qty:1,unit:'pc'},{item:'peanut butter',qty:2,unit:'tbsp'}],
    ['Slice apple.','Serve with peanut butter for dipping.']);

  add('Cheese and Crackers', ['balanced','vegetarian'], ['snack'],
    280, 22, 12, 16,
    [{item:'crackers',qty:6,unit:'pc'},{item:'cheddar',qty:50,unit:'g'}],
    ['Slice cheese.','Serve on crackers.']);

  add('Mixed Nuts', ['balanced','vegan','vegetarian','keto'], ['snack'],
    320, 8, 10, 28,
    [{item:'mixed nuts',qty:60,unit:'g'}],
    ['Portion into a small bowl and serve.']);

  add('Boiled Eggs', ['balanced','vegetarian','keto'], ['snack'],
    140, 1, 12, 10,
    [{item:'eggs',qty:2,unit:'pc'},{item:'salt',qty:0.5,unit:'tsp'}],
    ['Boil eggs for 7-8 minutes.','Cool in cold water, peel, and season.']);

  // ============================================================
  // VEGAN
  // ============================================================

  // Breakfast
  add('Overnight Oats with Berries', ['vegan','vegetarian','balanced'], ['breakfast'],
    360, 56, 12, 8,
    [{item:'oats',qty:80,unit:'g'},{item:'almond milk',qty:200,unit:'ml'},{item:'chia seeds',qty:15,unit:'g'},{item:'mixed berries',qty:80,unit:'g'},{item:'maple syrup',qty:1,unit:'tbsp'}],
    ['Mix oats, almond milk, and chia seeds in a jar.','Refrigerate overnight.','Top with berries and maple syrup in the morning.']);

  add('Chia Pudding', ['vegan','vegetarian','keto'], ['breakfast','snack'],
    320, 18, 12, 22,
    [{item:'chia seeds',qty:30,unit:'g'},{item:'coconut milk',qty:240,unit:'ml'},{item:'vanilla',qty:1,unit:'tsp'},{item:'berries',qty:80,unit:'g'}],
    ['Mix chia seeds with coconut milk and vanilla.','Stir well and refrigerate 2+ hours.','Top with berries before serving.']);

  add('Tofu Scramble', ['vegan','vegetarian'], ['breakfast','lunch'],
    290, 10, 22, 18,
    [{item:'tofu',qty:200,unit:'g'},{item:'turmeric',qty:0.5,unit:'tsp'},{item:'spinach',qty:60,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'onion',qty:0.5,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'}],
    ['Crumble tofu into a hot pan with olive oil.','Add turmeric, onion, and cook until fragrant.','Stir in tomato and spinach; cook until wilted.','Season and serve.']);

  add('Smoothie Bowl', ['vegan','vegetarian'], ['breakfast'],
    380, 58, 10, 10,
    [{item:'banana',qty:2,unit:'pc'},{item:'frozen mango',qty:100,unit:'g'},{item:'coconut milk',qty:150,unit:'ml'},{item:'granola',qty:40,unit:'g'},{item:'coconut flakes',qty:15,unit:'g'}],
    ['Blend banana, mango, and coconut milk until thick.','Pour into bowl.','Top with granola and coconut flakes.']);

  add('Peanut Butter Banana Toast', ['vegan','vegetarian'], ['breakfast','snack'],
    390, 48, 12, 16,
    [{item:'bread',qty:2,unit:'pc'},{item:'peanut butter',qty:2,unit:'tbsp'},{item:'banana',qty:1,unit:'pc'},{item:'chia seeds',qty:10,unit:'g'}],
    ['Toast bread.','Spread peanut butter generously.','Slice banana on top and sprinkle chia seeds.']);

  add('Avocado Toast with Hemp Seeds', ['vegan','vegetarian'], ['breakfast'],
    360, 28, 10, 22,
    [{item:'bread',qty:2,unit:'pc'},{item:'avocado',qty:1,unit:'pc'},{item:'hemp seeds',qty:15,unit:'g'},{item:'lemon',qty:0.25,unit:'pc'},{item:'chili flakes',qty:1,unit:'tsp'}],
    ['Toast bread.','Mash avocado with lemon; season.','Spread on toast; top with hemp seeds and chili flakes.']);

  // Lunch
  add('Chickpea Salad Wrap', ['vegan','vegetarian'], ['lunch'],
    440, 56, 18, 14,
    [{item:'chickpeas',qty:150,unit:'g'},{item:'tortilla',qty:1,unit:'pc'},{item:'lettuce',qty:40,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'tahini',qty:1,unit:'tbsp'},{item:'lemon',qty:0.5,unit:'pc'}],
    ['Mash chickpeas roughly with lemon and tahini.','Season well.','Fill tortilla with chickpea mix, lettuce, and tomato.','Roll and serve.']);

  add('Quinoa Buddha Bowl', ['vegan','vegetarian'], ['lunch','dinner'],
    520, 64, 20, 16,
    [{item:'quinoa',qty:80,unit:'g'},{item:'chickpeas',qty:100,unit:'g'},{item:'avocado',qty:0.5,unit:'pc'},{item:'spinach',qty:60,unit:'g'},{item:'tahini',qty:1,unit:'tbsp'},{item:'lemon',qty:0.5,unit:'pc'}],
    ['Cook quinoa per package.','Roast chickpeas at 200°C for 20 minutes until crispy.','Assemble bowl with quinoa, chickpeas, spinach, and avocado.','Drizzle with tahini-lemon dressing.']);

  add('Lentil and Vegetable Soup', ['vegan','vegetarian'], ['lunch','dinner'],
    380, 52, 20, 6,
    [{item:'red lentils',qty:100,unit:'g'},{item:'carrot',qty:1,unit:'pc'},{item:'celery',qty:1,unit:'stalk'},{item:'onion',qty:0.5,unit:'pc'},{item:'tomato',qty:1,unit:'pc'},{item:'cumin',qty:1,unit:'tsp'}],
    ['Sauté onion, carrot, and celery until soft.','Add lentils, tomato, cumin, and water/stock.','Simmer 25 minutes until lentils are soft.','Season and serve.']);

  add('Hummus and Veggie Pita', ['vegan','vegetarian'], ['lunch','snack'],
    400, 52, 14, 14,
    [{item:'pita bread',qty:1,unit:'pc'},{item:'hummus',qty:80,unit:'g'},{item:'cucumber',qty:0.5,unit:'pc'},{item:'carrot',qty:1,unit:'pc'},{item:'bell pepper',qty:0.5,unit:'pc'}],
    ['Warm pita if desired.','Spread hummus generously.','Top with sliced cucumber, carrot, and bell pepper.']);

  add('Vegan Burrito Bowl', ['vegan','vegetarian'], ['lunch','dinner'],
    540, 72, 18, 14,
    [{item:'brown rice',qty:80,unit:'g'},{item:'black beans',qty:120,unit:'g'},{item:'corn',qty:60,unit:'g'},{item:'avocado',qty:0.5,unit:'pc'},{item:'salsa',qty:60,unit:'g'},{item:'lime',qty:0.5,unit:'pc'}],
    ['Cook rice per package.','Heat black beans with cumin and salt.','Assemble bowl with rice, beans, corn, and avocado.','Top with salsa and squeeze of lime.']);

  // Dinner
  add('Red Lentil Dal', ['vegan','vegetarian'], ['dinner'],
    420, 58, 22, 8,
    [{item:'red lentils',qty:120,unit:'g'},{item:'coconut milk',qty:200,unit:'ml'},{item:'tomato',qty:1,unit:'pc'},{item:'onion',qty:0.5,unit:'pc'},{item:'turmeric',qty:0.5,unit:'tsp'},{item:'cumin',qty:1,unit:'tsp'},{item:'basmati rice',qty:80,unit:'g'}],
    ['Cook rice separately.','Sauté onion with cumin and turmeric.','Add lentils, tomato, and coconut milk.','Simmer 20 minutes until thick.','Serve over rice.']);

  add('Vegetable Stir-Fry with Tofu', ['vegan','vegetarian'], ['dinner'],
    460, 40, 28, 20,
    [{item:'tofu',qty:200,unit:'g'},{item:'broccoli',qty:120,unit:'g'},{item:'bell pepper',qty:1,unit:'pc'},{item:'snap peas',qty:80,unit:'g'},{item:'soy sauce',qty:2,unit:'tbsp'},{item:'garlic',qty:2,unit:'cloves'},{item:'ginger',qty:1,unit:'tsp'},{item:'brown rice',qty:80,unit:'g'}],
    ['Cook rice per package.','Press and cube tofu; pan-fry until golden.','Add vegetables, garlic, and ginger; cook 4 minutes.','Add soy sauce; toss and serve over rice.']);

  add('Chickpea and Spinach Curry', ['vegan','vegetarian'], ['dinner'],
    480, 56, 20, 14,
    [{item:'chickpeas',qty:150,unit:'g'},{item:'spinach',qty:100,unit:'g'},{item:'coconut milk',qty:200,unit:'ml'},{item:'tomato',qty:1,unit:'pc'},{item:'onion',qty:0.5,unit:'pc'},{item:'curry powder',qty:2,unit:'tsp'},{item:'basmati rice',qty:80,unit:'g'}],
    ['Cook rice separately.','Sauté onion; add curry powder and cook 1 minute.','Add chickpeas, tomato, and coconut milk.','Simmer 15 minutes; stir in spinach until wilted.','Serve over rice.']);

  add('Stuffed Bell Peppers', ['vegan','vegetarian'], ['dinner'],
    440, 58, 16, 12,
    [{item:'bell pepper',qty:2,unit:'pc'},{item:'quinoa',qty:80,unit:'g'},{item:'black beans',qty:100,unit:'g'},{item:'corn',qty:60,unit:'g'},{item:'tomato sauce',qty:100,unit:'g'},{item:'cumin',qty:1,unit:'tsp'}],
    ['Cook quinoa; mix with beans, corn, tomato sauce, and cumin.','Halve and deseed peppers.','Fill with quinoa mixture.','Bake at 190°C for 25 minutes.']);

  add('Zucchini Noodles with Pesto', ['vegan','vegetarian','keto'], ['dinner','lunch'],
    360, 14, 10, 28,
    [{item:'zucchini',qty:2,unit:'pc'},{item:'basil',qty:20,unit:'g'},{item:'pine nuts',qty:25,unit:'g'},{item:'olive oil',qty:3,unit:'tbsp'},{item:'garlic',qty:1,unit:'cloves'},{item:'lemon',qty:0.5,unit:'pc'}],
    ['Spiralize zucchini.','Blend basil, pine nuts, olive oil, garlic, and lemon into pesto.','Toss zoodles with pesto; season to taste.']);

  // Snack
  add('Apple and Almond Butter', ['vegan','vegetarian','balanced'], ['snack'],
    260, 28, 6, 14,
    [{item:'apple',qty:1,unit:'pc'},{item:'almond butter',qty:2,unit:'tbsp'}],
    ['Slice apple and serve with almond butter.']);

  add('Roasted Chickpeas', ['vegan','vegetarian'], ['snack'],
    220, 28, 10, 6,
    [{item:'chickpeas',qty:150,unit:'g'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'paprika',qty:1,unit:'tsp'},{item:'salt',qty:0.5,unit:'tsp'}],
    ['Dry chickpeas well; toss with olive oil and paprika.','Roast at 200°C for 25-30 minutes until crunchy.']);

  add('Fruit and Nut Energy Balls', ['vegan','vegetarian'], ['snack'],
    280, 32, 8, 14,
    [{item:'dates',qty:100,unit:'g'},{item:'almonds',qty:50,unit:'g'},{item:'oats',qty:40,unit:'g'},{item:'cocoa powder',qty:1,unit:'tbsp'}],
    ['Blend dates and almonds into a paste.','Mix in oats and cocoa.','Roll into balls and refrigerate 30 minutes.']);

  add('Edamame with Sea Salt', ['vegan','vegetarian'], ['snack'],
    180, 12, 16, 6,
    [{item:'edamame',qty:150,unit:'g'},{item:'sea salt',qty:0.5,unit:'tsp'}],
    ['Boil or steam edamame for 5 minutes.','Drain and toss with sea salt.']);

  // ============================================================
  // VEGETARIAN (non-vegan)
  // ============================================================

  add('Cheese Omelette', ['vegetarian'], ['breakfast'],
    380, 4, 26, 28,
    [{item:'eggs',qty:3,unit:'pc'},{item:'cheddar',qty:50,unit:'g'},{item:'butter',qty:8,unit:'g'},{item:'salt',qty:0.5,unit:'tsp'}],
    ['Whisk eggs with salt.','Melt butter in pan; pour in eggs.','Add cheese; fold omelette when almost set.','Serve immediately.']);

  add('French Toast', ['vegetarian'], ['breakfast'],
    440, 48, 18, 18,
    [{item:'bread',qty:2,unit:'pc'},{item:'eggs',qty:2,unit:'pc'},{item:'milk',qty:60,unit:'ml'},{item:'butter',qty:10,unit:'g'},{item:'maple syrup',qty:1,unit:'tbsp'},{item:'cinnamon',qty:0.5,unit:'tsp'}],
    ['Whisk eggs, milk, and cinnamon.','Dip bread in mixture.','Fry in butter 2-3 min per side until golden.','Serve with maple syrup.']);

  add('Caprese Salad', ['vegetarian'], ['lunch','snack'],
    340, 8, 20, 24,
    [{item:'tomato',qty:2,unit:'pc'},{item:'mozzarella',qty:120,unit:'g'},{item:'basil',qty:10,unit:'g'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'balsamic vinegar',qty:1,unit:'tsp'}],
    ['Slice tomatoes and mozzarella.','Alternate on a plate.','Top with basil; drizzle olive oil and balsamic.']);

  add('Grilled Halloumi Salad', ['vegetarian'], ['lunch'],
    420, 14, 22, 28,
    [{item:'halloumi',qty:120,unit:'g'},{item:'mixed greens',qty:80,unit:'g'},{item:'tomato',qty:1,unit:'pc'},{item:'cucumber',qty:0.5,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'lemon',qty:0.5,unit:'pc'}],
    ['Slice and grill halloumi until golden.','Assemble greens, tomato, and cucumber.','Top with halloumi; dress with olive oil and lemon.']);

  add('Spinach and Feta Quesadilla', ['vegetarian'], ['lunch','snack'],
    460, 42, 22, 22,
    [{item:'tortilla',qty:2,unit:'pc'},{item:'spinach',qty:60,unit:'g'},{item:'feta',qty:80,unit:'g'},{item:'bell pepper',qty:0.5,unit:'pc'},{item:'butter',qty:8,unit:'g'}],
    ['Layer spinach, feta, and bell pepper on one tortilla; top with second.','Cook in buttered pan 2-3 min per side until golden.','Slice and serve.']);

  add('Mushroom Risotto', ['vegetarian'], ['dinner'],
    520, 68, 16, 18,
    [{item:'arborio rice',qty:100,unit:'g'},{item:'mushrooms',qty:200,unit:'g'},{item:'parmesan',qty:40,unit:'g'},{item:'vegetable broth',qty:500,unit:'ml'},{item:'onion',qty:0.5,unit:'pc'},{item:'white wine',qty:60,unit:'ml'},{item:'butter',qty:15,unit:'g'}],
    ['Sauté onion and mushrooms in butter.','Add rice; toast 1 minute.','Add wine; stir until absorbed.','Add broth ladle by ladle, stirring until creamy.','Finish with parmesan.']);

  add('Eggplant Parmesan', ['vegetarian'], ['dinner'],
    520, 38, 24, 26,
    [{item:'eggplant',qty:1,unit:'pc'},{item:'tomato sauce',qty:200,unit:'g'},{item:'mozzarella',qty:100,unit:'g'},{item:'parmesan',qty:30,unit:'g'},{item:'breadcrumbs',qty:40,unit:'g'},{item:'egg',qty:1,unit:'pc'}],
    ['Slice eggplant; dip in egg then breadcrumbs.','Bake slices at 200°C for 20 minutes.','Layer with tomato sauce and cheeses in dish.','Bake again at 190°C for 15 minutes until bubbling.']);

  add('Veggie Pasta Primavera', ['vegetarian'], ['dinner'],
    480, 68, 18, 14,
    [{item:'pasta',qty:100,unit:'g'},{item:'zucchini',qty:1,unit:'pc'},{item:'cherry tomatoes',qty:100,unit:'g'},{item:'spinach',qty:60,unit:'g'},{item:'parmesan',qty:30,unit:'g'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'garlic',qty:2,unit:'cloves'}],
    ['Cook pasta al dente.','Sauté garlic, zucchini, and tomatoes in olive oil.','Toss with pasta and spinach until wilted.','Top with parmesan.']);

  add('Greek Salad with Feta', ['vegetarian'], ['lunch'],
    320, 14, 12, 24,
    [{item:'tomato',qty:2,unit:'pc'},{item:'cucumber',qty:1,unit:'pc'},{item:'feta',qty:100,unit:'g'},{item:'kalamata olives',qty:40,unit:'g'},{item:'red onion',qty:0.25,unit:'pc'},{item:'olive oil',qty:1,unit:'tbsp'}],
    ['Chop tomatoes, cucumber, and onion.','Combine with olives and feta.','Drizzle with olive oil; season and serve.']);

  // ============================================================
  // KETO
  // ============================================================

  // Breakfast
  add('Bacon and Eggs', ['keto'], ['breakfast'],
    480, 2, 28, 40,
    [{item:'bacon',qty:100,unit:'g'},{item:'eggs',qty:3,unit:'pc'},{item:'butter',qty:8,unit:'g'}],
    ['Cook bacon until crispy.','Fry eggs in butter to preference.','Serve together.']);

  add('Keto Omelette with Cheese and Spinach', ['keto','vegetarian'], ['breakfast'],
    420, 4, 28, 32,
    [{item:'eggs',qty:3,unit:'pc'},{item:'cheddar',qty:60,unit:'g'},{item:'spinach',qty:40,unit:'g'},{item:'butter',qty:10,unit:'g'},{item:'salt',qty:0.5,unit:'tsp'}],
    ['Whisk eggs with salt.','Melt butter; pour in eggs.','Add spinach and cheese; fold when almost set.']);

  add('Smoked Salmon with Cream Cheese', ['keto'], ['breakfast','snack'],
    320, 2, 22, 24,
    [{item:'smoked salmon',qty:100,unit:'g'},{item:'cream cheese',qty:60,unit:'g'},{item:'cucumber',qty:0.5,unit:'pc'},{item:'capers',qty:1,unit:'tbsp'}],
    ['Slice cucumber into rounds.','Top with cream cheese and smoked salmon.','Garnish with capers.']);

  add('Keto Egg Muffins', ['keto'], ['breakfast','snack'],
    340, 3, 24, 26,
    [{item:'eggs',qty:4,unit:'pc'},{item:'bacon',qty:60,unit:'g'},{item:'cheddar',qty:50,unit:'g'},{item:'bell pepper',qty:0.5,unit:'pc'},{item:'salt',qty:0.5,unit:'tsp'}],
    ['Preheat oven to 180°C.','Whisk eggs; mix in chopped bacon, cheese, and pepper.','Pour into greased muffin tin.','Bake 18-20 minutes until set.']);

  add('Bulletproof Coffee with Boiled Eggs', ['keto'], ['breakfast'],
    380, 1, 14, 34,
    [{item:'coffee',qty:240,unit:'ml'},{item:'butter',qty:15,unit:'g'},{item:'coconut oil',qty:1,unit:'tbsp'},{item:'eggs',qty:2,unit:'pc'}],
    ['Brew strong coffee.','Blend with butter and coconut oil until frothy.','Serve with hard-boiled eggs on the side.']);

  // Lunch
  add('Caesar Salad with Chicken', ['keto'], ['lunch'],
    420, 6, 38, 26,
    [{item:'chicken breast',qty:180,unit:'g'},{item:'romaine lettuce',qty:100,unit:'g'},{item:'parmesan',qty:30,unit:'g'},{item:'caesar dressing',qty:2,unit:'tbsp'},{item:'bacon bits',qty:20,unit:'g'}],
    ['Grill chicken and slice.','Toss romaine with caesar dressing.','Top with chicken, parmesan, and bacon bits.']);

  add('Keto Tuna Lettuce Wraps', ['keto'], ['lunch'],
    300, 3, 32, 18,
    [{item:'tuna',qty:150,unit:'g'},{item:'mayonnaise',qty:2,unit:'tbsp'},{item:'lettuce leaves',qty:4,unit:'pc'},{item:'celery',qty:1,unit:'stalk'},{item:'lemon',qty:0.25,unit:'pc'}],
    ['Mix tuna with mayo, chopped celery, and lemon.','Spoon into lettuce cups and serve.']);

  add('Bacon Avocado Salad', ['keto'], ['lunch'],
    460, 6, 18, 40,
    [{item:'bacon',qty:80,unit:'g'},{item:'avocado',qty:1,unit:'pc'},{item:'mixed greens',qty:80,unit:'g'},{item:'cherry tomatoes',qty:60,unit:'g'},{item:'olive oil',qty:1,unit:'tbsp'}],
    ['Cook bacon until crispy; crumble.','Slice avocado.','Combine greens, tomatoes, and avocado.','Top with bacon; dress with olive oil.']);

  add('Zucchini Noodles with Bolognese', ['keto'], ['lunch','dinner'],
    480, 12, 36, 30,
    [{item:'zucchini',qty:2,unit:'pc'},{item:'ground beef',qty:200,unit:'g'},{item:'tomato sauce',qty:150,unit:'g'},{item:'garlic',qty:2,unit:'cloves'},{item:'onion',qty:0.25,unit:'pc'},{item:'parmesan',qty:20,unit:'g'}],
    ['Spiralize zucchini.','Brown beef with garlic and onion.','Add tomato sauce; simmer 10 minutes.','Serve over zoodles; top with parmesan.']);

  // Dinner
  add('Ribeye Steak with Butter', ['keto'], ['dinner'],
    720, 0, 55, 54,
    [{item:'ribeye steak',qty:300,unit:'g'},{item:'butter',qty:20,unit:'g'},{item:'garlic',qty:2,unit:'cloves'},{item:'rosemary',qty:1,unit:'tsp'},{item:'salt',qty:1,unit:'tsp'}],
    ['Season steak generously with salt.','Sear on high heat 3-4 min per side.','Baste with butter, garlic, and rosemary.','Rest 5 minutes before serving.']);

  add('Baked Chicken Thighs with Asparagus', ['keto'], ['dinner'],
    520, 4, 46, 34,
    [{item:'chicken thighs',qty:300,unit:'g'},{item:'asparagus',qty:150,unit:'g'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'garlic',qty:2,unit:'cloves'},{item:'lemon',qty:0.5,unit:'pc'}],
    ['Season chicken; bake at 200°C for 35 minutes.','Toss asparagus with olive oil and garlic.','Add to oven for last 15 minutes.','Finish with lemon juice.']);

  add('Salmon with Creamy Spinach', ['keto'], ['dinner'],
    560, 6, 42, 40,
    [{item:'salmon fillet',qty:200,unit:'g'},{item:'spinach',qty:120,unit:'g'},{item:'cream',qty:80,unit:'ml'},{item:'garlic',qty:2,unit:'cloves'},{item:'parmesan',qty:20,unit:'g'},{item:'butter',qty:10,unit:'g'}],
    ['Pan-sear salmon 4 min per side; set aside.','Sauté garlic in butter; add spinach until wilted.','Pour in cream; simmer 3 minutes; add parmesan.','Serve salmon over creamy spinach.']);

  add('Pork Belly with Green Beans', ['keto'], ['dinner'],
    680, 4, 34, 58,
    [{item:'pork belly',qty:250,unit:'g'},{item:'green beans',qty:150,unit:'g'},{item:'garlic',qty:2,unit:'cloves'},{item:'olive oil',qty:1,unit:'tbsp'},{item:'salt',qty:1,unit:'tsp'}],
    ['Score pork belly skin; season generously.','Roast at 220°C for 30 minutes then 180°C for 30 more.','Sauté green beans with garlic and olive oil.','Serve together.']);

  add('Ground Beef Lettuce Tacos', ['keto'], ['dinner','lunch'],
    440, 6, 36, 30,
    [{item:'ground beef',qty:200,unit:'g'},{item:'lettuce leaves',qty:6,unit:'pc'},{item:'cheddar',qty:50,unit:'g'},{item:'sour cream',qty:2,unit:'tbsp'},{item:'cumin',qty:1,unit:'tsp'},{item:'garlic',qty:2,unit:'cloves'}],
    ['Brown beef with garlic and cumin; season.','Spoon into lettuce cups.','Top with cheddar and sour cream.']);

  // Snack
  add('Keto Egg Salad', ['keto','vegetarian'], ['snack','lunch'],
    320, 2, 18, 26,
    [{item:'eggs',qty:4,unit:'pc'},{item:'mayonnaise',qty:2,unit:'tbsp'},{item:'mustard',qty:1,unit:'tsp'},{item:'salt',qty:0.5,unit:'tsp'},{item:'chives',qty:5,unit:'g'}],
    ['Hard boil eggs; peel and chop.','Mix with mayo, mustard, and chives.','Season and serve chilled.']);

  add('Cheese Crisps', ['keto','vegetarian'], ['snack'],
    220, 1, 14, 18,
    [{item:'cheddar',qty:80,unit:'g'}],
    ['Preheat oven to 200°C.','Place small mounds of grated cheese on baking paper.','Bake 5-7 minutes until crispy and golden.','Cool before eating.']);

  add('Celery with Cream Cheese', ['keto','vegetarian'], ['snack'],
    160, 4, 6, 14,
    [{item:'celery',qty:3,unit:'stalk'},{item:'cream cheese',qty:60,unit:'g'}],
    ['Trim and wash celery stalks.','Fill groove with cream cheese and serve.']);

  add('Pepperoni and Cheese Plate', ['keto'], ['snack'],
    360, 2, 20, 30,
    [{item:'pepperoni',qty:60,unit:'g'},{item:'cheddar',qty:60,unit:'g'},{item:'olives',qty:30,unit:'g'}],
    ['Arrange pepperoni, cheese slices, and olives on a plate.','Serve immediately.']);

  return R;
}

const RECIPES = buildRecipes();

// ---- PLAN GENERATION ----------------------------------------
function clampInt(n, min, max) { return Math.max(min, Math.min(max, isNaN(n) ? min : n)); }
function toList(v) { return (v||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean); }
function pretty(key) { return (key||'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }

function containsAny(ingredient, avoidSet) {
  const token = String(ingredient).toLowerCase();
  for (const a of avoidSet) { if (a && token.includes(String(a).toLowerCase())) return true; }
  return false;
}
function uniqueByName(arr) {
  const seen = new Set(); const res = [];
  for (const r of arr) { if (!seen.has(r.name)) { seen.add(r.name); res.push(r); } }
  return res;
}

function getPoolForType(prefs, mealType) {
  const { dietType, allergies, exclusions } = prefs;
  const avoid = new Set([...(allergies||[]), ...(exclusions||[])]);
  let pool = RECIPES
    .filter(r => r.diet.includes(dietType))
    .filter(r => r.type.includes(mealType))
    .filter(r => (r.ingredients||[]).every(i => !containsAny(typeof i==='string'?i:i.item, avoid)));
  // Shuffle
  for (let i = pool.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }
  return pool;
}

// FIX: generates today's plan by picking from each meal type separately
function generateTodayPlan(prefs) {
  const selectedTypes = prefs.mealTypes || ['breakfast','lunch','dinner','snack'];
  const meals = [];
  const usedNames = new Set();

  selectedTypes.forEach(type => {
    const pool = getPoolForType(prefs, type).filter(r => !usedNames.has(r.name));
    if (pool.length > 0) {
      meals.push(pool[0]);
      usedNames.add(pool[0].name);
    }
  });

  return { meals };
}

// FIX: generates weekly plan properly — each day gets each selected meal type filled
function generateWeekPlan(prefs) {
  const selectedTypes = prefs.mealTypes || ['breakfast','lunch','dinner','snack'];
  const usedNames = new Set();
  const days = [];

  // Build a pool per meal type
  const pools = {};
  selectedTypes.forEach(type => {
    pools[type] = getPoolForType(prefs, type);
  });

  for (let d = 0; d < 7; d++) {
    const meals = [];
    selectedTypes.forEach(type => {
      // Find next unused recipe for this type
      const available = pools[type].filter(r => !usedNames.has(r.name));
      if (available.length > 0) {
        meals.push(available[0]);
        usedNames.add(available[0].name);
      } else {
        // If we run out, allow reuse
        const fallback = pools[type];
        if (fallback.length > 0) meals.push(fallback[d % fallback.length]);
      }
    });
    days.push({ day: d + 1, meals });
  }

  return { days };
}

// ---- RENDER TABLE -------------------------------------------
function mealTypesFromPrefs(prefs) {
  const t = prefs?.mealTypes?.length ? prefs.mealTypes : ['breakfast','lunch','dinner','snack'];
  return ['breakfast','lunch','dinner','snack'].filter(x => t.includes(x));
}

function renderTableForPlan(plan, prefs, isWeek) {
  const container = document.getElementById('mealsContainer');
  const summary   = document.getElementById('planSummary');
  container.innerHTML = '';

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
        <button id="btnShowFavsTable" class="btn small">❤ Favorites</button>
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

  // FIX: handle both today (plan.meals) and week (plan.days) correctly
  const rows = isWeek
    ? plan.days.map((d, i) => ({ label: `Day ${i+1}`, meals: d.meals }))
    : [{ label: 'Today', meals: plan.meals }];

  rows.forEach(rowObj => {
    // Map meals to their types
    const slotMap = {};
    selectedTypes.forEach(t => slotMap[t] = null);
    (rowObj.meals || []).forEach((m, idx) => {
      const type = selectedTypes[idx];
      if (type) slotMap[type] = m;
    });

    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="day-col">${rowObj.label}</td>` +
      selectedTypes.map(t => {
        const m = slotMap[t];
        if (!m) return `<td class="empty">—</td>`;
        const liked = isFav(m.name);
        const steps = (m.instructions||[]).map(s=>`<li>${s}</li>`).join('');
        const ing   = (m.ingredients||[]).map(i=>typeof i==='string'?i:i.item).join(', ');
        return `<td><div class="cell-meal">
          <div class="cell-top">
            <div class="cell-name">${m.name}</div>
            <div>
              <button class="cell-like" data-name="${m.name}" aria-pressed="${liked}">${liked?'♥':'♡'}</button>
              <button class="cell-save" title="Save plan">↓</button>
              <button class="cell-toggle">Details</button>
            </div>
          </div>
          <div class="cell-macros">kcal ${m.macros.calories} • C ${m.macros.carbs}g • P ${m.macros.protein}g • F ${m.macros.fat}g</div>
          <div class="cell-details">
            <div class="muted" style="margin-bottom:6px;">Ingredients: ${ing}</div>
            <ol class="instructions">${steps}</ol>
          </div>
        </div></td>`;
      }).join('');
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
  summary.textContent = isWeek
    ? `Weekly plan • Diet: ${pretty(prefs.dietType)} • ${selectedTypes.length} meal types per day`
    : `Diet: ${pretty(prefs.dietType)} • Meals: ${prefs.mealsPerDay}`;

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

  // Bind save
  container.querySelectorAll('.cell-save').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!state.user.guest) {
        await apiFetch('/api/plans/save', 'POST', { userId: state.user.id, plan, timePeriod: prefs.timePeriod || 'today' });
      }
      toast('✓ Meal plan saved!');
      btn.classList.add('saved'); setTimeout(() => btn.classList.remove('saved'), 1000);
    }));

  buildShoppingList(plan, isWeek, selectedTypes);
}

function buildShoppingList(plan, isWeek, selectedTypes) {
  const ingredientMap = new Map();
  const rows = isWeek ? plan.days : [{ meals: plan.meals }];
  rows.forEach(dayObj => {
    (dayObj.meals || []).forEach(m => {
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
  if (favMeals.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:20px 0;">No favorites yet. Heart a meal to save it here!</p>';
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
  if (!state.planList || state.planList.length === 0) {
    listEl.innerHTML = '<li style="color:var(--muted)">Generate a meal plan first to see your shopping list.</li>';
    return;
  }
  state.planList.forEach(text => {
    const li = document.createElement('li'); li.textContent = text; listEl.appendChild(li);
  });
}

function downloadShoppingList() {
  const lines = state.planList && state.planList.length ? state.planList : ['No items'];
  const blob  = new Blob([lines.join('\n')], { type:'text/plain' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
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

// ---- INIT ---------------------------------------------------
showPage('auth');
