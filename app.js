// CORS proxy to fetch external pages (using corsproxy.io which works with file:// origins)
const CORS_PROXY = 'https://corsproxy.io/?';

// DOM elements
const urlInput = document.getElementById('recipe-url');
const fetchBtn = document.getElementById('fetch-btn');
const errorDiv = document.getElementById('error-message');
const loadingDiv = document.getElementById('loading');
const recipeCard = document.getElementById('recipe-card');
const actionsDiv = document.getElementById('actions');

// Allow Enter key to submit
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchRecipe();
});

async function fetchRecipe() {
    const url = urlInput.value.trim();

    if (!url) {
        showError('Please enter a recipe URL');
        return;
    }

    if (!isValidUrl(url)) {
        showError('Please enter a valid URL');
        return;
    }

    // Reset state
    hideError();
    showLoading();
    recipeCard.classList.remove('visible');
    actionsDiv.style.display = 'none';
    fetchBtn.disabled = true;

    try {
        const response = await fetch(CORS_PROXY + encodeURIComponent(url));

        if (!response.ok) {
            throw new Error('Failed to fetch the recipe page');
        }

        const html = await response.text();
        const recipe = parseRecipe(html, url);

        if (!recipe) {
            throw new Error('Could not find recipe data on this page. Try a different recipe site.');
        }

        displayRecipe(recipe);
    } catch (error) {
        showError(error.message || 'Failed to fetch recipe. Try a different URL.');
    } finally {
        hideLoading();
        fetchBtn.disabled = false;
    }
}

function parseRecipe(html, url) {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try to find JSON-LD structured data first (most reliable)
    const recipe = extractJsonLdRecipe(doc);
    if (recipe) return recipe;

    // Fallback: try to find recipe from common HTML patterns
    return extractHtmlRecipe(doc);
}

function extractJsonLdRecipe(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
        try {
            let data = JSON.parse(script.textContent);

            // Handle @graph arrays (common in WordPress sites)
            if (data['@graph']) {
                data = data['@graph'];
            }

            // Handle arrays
            if (Array.isArray(data)) {
                const recipeData = data.find(item =>
                    item['@type'] === 'Recipe' ||
                    (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
                );
                if (recipeData) {
                    return normalizeRecipe(recipeData);
                }
            } else if (data['@type'] === 'Recipe' ||
                      (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))) {
                return normalizeRecipe(data);
            }
        } catch (e) {
            // Continue to next script tag
        }
    }

    return null;
}

function normalizeRecipe(data) {
    const title = data.name || 'Untitled Recipe';

    // Extract ingredients
    let ingredients = [];
    if (data.recipeIngredient) {
        ingredients = Array.isArray(data.recipeIngredient)
            ? data.recipeIngredient
            : [data.recipeIngredient];
    }

    // Extract instructions
    let instructions = [];
    if (data.recipeInstructions) {
        if (typeof data.recipeInstructions === 'string') {
            // Single string - split by periods or newlines
            instructions = data.recipeInstructions
                .split(/(?:\.\s+|\n+)/)
                .filter(s => s.trim().length > 0);
        } else if (Array.isArray(data.recipeInstructions)) {
            instructions = data.recipeInstructions.map(item => {
                if (typeof item === 'string') return item;
                if (item.text) return item.text;
                if (item.name) return item.name;
                if (item['@type'] === 'HowToStep') return item.text || item.name || '';
                if (item['@type'] === 'HowToSection') {
                    // Handle sectioned instructions
                    if (item.itemListElement) {
                        return item.itemListElement.map(step =>
                            typeof step === 'string' ? step : (step.text || step.name || '')
                        ).join(' ');
                    }
                }
                return '';
            }).filter(s => s.length > 0);
        }
    }

    // Clean up instructions - remove HTML tags and excessive whitespace
    instructions = instructions.map(inst =>
        inst.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    );

    return { title, ingredients, instructions };
}

function extractHtmlRecipe(doc) {
    // Fallback: look for common recipe HTML patterns
    let title = '';
    let ingredients = [];
    let instructions = [];

    // Try to find title
    const titleSelectors = [
        'h1.recipe-title',
        'h1.entry-title',
        '.recipe-name',
        'h1[itemprop="name"]',
        '.tasty-recipes-title',
        'h2.wprm-recipe-name',
        'h1'
    ];

    for (const selector of titleSelectors) {
        const el = doc.querySelector(selector);
        if (el && el.textContent.trim()) {
            title = el.textContent.trim();
            break;
        }
    }

    // Try to find ingredients
    const ingredientSelectors = [
        '[itemprop="recipeIngredient"]',
        '.ingredient',
        '.ingredients li',
        '.recipe-ingredients li',
        '.wprm-recipe-ingredient',
        '.tasty-recipes-ingredients li'
    ];

    for (const selector of ingredientSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
            ingredients = Array.from(elements).map(el => el.textContent.trim());
            break;
        }
    }

    // Try to find instructions
    const instructionSelectors = [
        '[itemprop="recipeInstructions"]',
        '.instructions li',
        '.recipe-instructions li',
        '.directions li',
        '.wprm-recipe-instruction',
        '.tasty-recipes-instructions li'
    ];

    for (const selector of instructionSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
            instructions = Array.from(elements).map(el => el.textContent.trim());
            break;
        }
    }

    if (title && (ingredients.length > 0 || instructions.length > 0)) {
        return { title, ingredients, instructions };
    }

    return null;
}

function displayRecipe(recipe) {
    document.getElementById('recipe-title').textContent = recipe.title;

    // Display ingredients
    const ingredientsList = document.getElementById('ingredients-list');
    ingredientsList.innerHTML = '';
    recipe.ingredients.forEach(ing => {
        const li = document.createElement('li');
        li.textContent = ing;
        ingredientsList.appendChild(li);
    });

    // Display instructions
    const instructionsList = document.getElementById('instructions-list');
    instructionsList.innerHTML = '';
    recipe.instructions.forEach(inst => {
        const li = document.createElement('li');
        li.textContent = inst;
        instructionsList.appendChild(li);
    });

    // Show card and actions
    recipeCard.classList.add('visible');
    actionsDiv.style.display = 'flex';
}

function resetCard() {
    urlInput.value = '';
    recipeCard.classList.remove('visible');
    actionsDiv.style.display = 'none';
    hideError();
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    errorDiv.style.display = 'none';
}

function showLoading() {
    loadingDiv.style.display = 'block';
}

function hideLoading() {
    loadingDiv.style.display = 'none';
}
