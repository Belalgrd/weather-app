const API_KEY = 'yr-api-key'; // Replace with your OpenWeatherMap API key
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const CACHE_TIME = 10 * 60 * 1000; // 10 minutes cache

const elements = {
    searchInput: document.querySelector('.search-input'),
    searchBtn: document.querySelector('.search-btn'),
    locationBtn: document.querySelector('.location-btn'),
    unitBtns: document.querySelectorAll('.unit-btn'),
    location: document.querySelector('.location span'),
    temperature: document.querySelector('.temperature'),
    condition: document.querySelector('.condition'),
    weatherIcon: document.querySelector('.weather-icon img'),
    feelsLike: document.querySelector('.feels-like'),
    humidity: document.querySelector('.humidity'),
    wind: document.querySelector('.wind'),
    pressure: document.querySelector('.pressure'),
    forecastContent: document.querySelectorAll('.forecast-content'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    recentList: document.querySelector('.recent-list'),
    loadingOverlay: document.querySelector('.loading-overlay'),
    errorContainer: document.createElement('div') // New error container
};

// State management
let state = {
    currentUnit: 'metric',
    recentSearches: JSON.parse(localStorage.getItem('recentSearches')) || [],
    lastLocation: null,
    cache: JSON.parse(localStorage.getItem('weatherCache')) || {}
};

// Initialize error container
elements.errorContainer.className = 'error-message';
document.body.prepend(elements.errorContainer);

// Event Listeners
elements.searchBtn.addEventListener('click', handleSearch);
elements.locationBtn.addEventListener('click', getGeolocation);
elements.unitBtns.forEach(btn => btn.addEventListener('click', toggleUnit));
elements.tabBtns.forEach(btn => btn.addEventListener('click', switchForecastTab));
elements.recentList.addEventListener('click', handleRecentSearch);
elements.searchInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleSearch());

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    updateRecentSearches();
    loadLastLocation();
});

async function handleSearch() {
    const city = elements.searchInput.value.trim();
    if (!city) return showError('Please enter a city name');
    
    try {
        showLoading();
        const data = await getWeatherData(city);
        updateUI(data);
        addRecentSearch(city);
        elements.searchInput.value = '';
        state.lastLocation = { type: 'city', value: city };
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function getGeolocation() {
    if (!navigator.geolocation) {
        return showError('Geolocation is not supported by your browser');
    }

    showLoading();
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        
        const { latitude, longitude } = position.coords;
        const data = await getWeatherData(null, { lat: latitude, lon: longitude });
        updateUI(data);
        state.lastLocation = { type: 'coords', value: { lat: latitude, lon: longitude } };
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function getWeatherData(query, coords) {
    const cacheKey = coords ? 
        `coords-${coords.lat}-${coords.lon}-${state.currentUnit}` : 
        `city-${query}-${state.currentUnit}`;
    
    // Check cache validity
    if (state.cache[cacheKey] && Date.now() - state.cache[cacheKey].timestamp < CACHE_TIME) {
        return state.cache[cacheKey].data;
    }

    let url;
    if (coords) {
        url = `${BASE_URL}/weather?lat=${coords.lat}&lon=${coords.lon}&units=${state.currentUnit}&appid=${API_KEY}`;
    } else {
        url = `${BASE_URL}/weather?q=${query}&units=${state.currentUnit}&appid=${API_KEY}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('City not found');
    const currentData = await response.json();
    
    const forecastUrl = `${BASE_URL}/forecast?lat=${currentData.coord.lat}&lon=${currentData.coord.lon}&units=${state.currentUnit}&appid=${API_KEY}`;
    const forecastResponse = await fetch(forecastUrl);
    const forecastData = await forecastResponse.json();
    
    const fullData = { current: currentData, forecast: forecastData };
    
    // Update cache
    state.cache[cacheKey] = {
        timestamp: Date.now(),
        data: fullData
    };
    localStorage.setItem('weatherCache', JSON.stringify(state.cache));
    
    return fullData;
}

function updateUI(data) {
    const { current, forecast } = data;
    
    // Update current weather
    elements.location.textContent = `${current.name}, ${current.sys.country}`;
    elements.temperature.textContent = `${Math.round(current.main.temp)}°`;
    elements.condition.textContent = current.weather[0].description;
    elements.weatherIcon.src = `https://openweathermap.org/img/wn/${current.weather[0].icon}@2x.png`;
    
    // Update weather details
    elements.feelsLike.textContent = `${Math.round(current.main.feels_like)}°`;
    elements.humidity.textContent = `${current.main.humidity}%`;
    elements.wind.textContent = formatWindSpeed(current.wind.speed);
    elements.pressure.textContent = `${current.main.pressure} hPa`;

    // Update forecast
    updateForecast(forecast);
    updateTabActiveState();
}

function formatWindSpeed(speed) {
    return state.currentUnit === 'metric' ? 
        `${Math.round(speed * 3.6)} km/h` : 
        `${Math.round(speed)} mph`;
}

function updateForecast(forecastData) {
    const isHourly = document.querySelector('.tab-btn.active').dataset.type === 'hourly';
    const forecastContainer = isHourly ? document.querySelector('.hourly') : document.querySelector('.daily');
    
    forecastContainer.innerHTML = isHourly ? 
        generateHourlyForecast(forecastData.list) : 
        generateDailyForecast(forecastData.list);
}

function generateHourlyForecast(list) {
    return list.slice(0, 8).map(item => `
        <div class="forecast-item" role="article">
            <div>${new Date(item.dt * 1000).toLocaleTimeString([], { hour: '2-digit' })}</div>
            <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" 
                 alt="${item.weather[0].description}" 
                 aria-hidden="true">
            <div>${Math.round(item.main.temp)}°</div>
        </div>
    `).join('');
}

function generateDailyForecast(list) {
    const dailyData = list.reduce((acc, item) => {
        const date = new Date(item.dt * 1000).toLocaleDateString();
        if (!acc[date]) {
            acc[date] = {
                min: item.main.temp_min,
                max: item.main.temp_max,
                icon: item.weather[0].icon,
                description: item.weather[0].main
            };
        } else {
            acc[date].min = Math.min(acc[date].min, item.main.temp_min);
            acc[date].max = Math.max(acc[date].max, item.main.temp_max);
        }
        return acc;
    }, {});

    return Object.entries(dailyData).slice(0, 5).map(([date, data]) => `
        <div class="forecast-item" role="article">
            <div>${new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <img src="https://openweathermap.org/img/wn/${data.icon}.png" 
                 alt="${data.description}" 
                 aria-hidden="true">
            <div>${Math.round(data.max)}°/${Math.round(data.min)}°</div>
        </div>
    `).join('');
}

function toggleUnit(e) {
    const unit = e.target.dataset.unit;
    if (unit === state.currentUnit) return;

    state.currentUnit = unit;
    elements.unitBtns.forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    
    if (state.lastLocation) {
        showLoading();
        getWeatherData(
            state.lastLocation.type === 'city' ? state.lastLocation.value : null,
            state.lastLocation.type === 'coords' ? state.lastLocation.value : null
        )
        .then(updateUI)
        .catch(showError)
        .finally(hideLoading);
    }
}

function switchForecastTab(e) {
    if (!e.target.classList.contains('tab-btn')) return;

    const type = e.target.dataset.type;
    elements.tabBtns.forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');

    document.querySelectorAll('.forecast-content').forEach(content => {
        content.classList.toggle('active', content.classList.contains(type));
    });

    updateTabActiveState();
}

function updateTabActiveState() {
    document.querySelectorAll('.forecast-content').forEach(content => {
        content.style.display = content.classList.contains('active') ? 'flex' : 'none';
    });
}

function addRecentSearch(city) {
    if (!state.recentSearches.includes(city)) {
        state.recentSearches = [city, ...state.recentSearches].slice(0, 5);
        localStorage.setItem('recentSearches', JSON.stringify(state.recentSearches));
        updateRecentSearches();
    }
}

function updateRecentSearches() {
    elements.recentList.innerHTML = state.recentSearches
        .map(city => `<div class="recent-city" role="button" tabindex="0">${city}</div>`)
        .join('');
}

function handleRecentSearch(e) {
    if (!e.target.classList.contains('recent-city')) return;
    elements.searchInput.value = e.target.textContent;
    handleSearch();
}

function loadLastLocation() {
    if (navigator.geolocation && !state.lastLocation) {
        getGeolocation();
    } else if (state.lastLocation) {
        showLoading();
        getWeatherData(
            state.lastLocation.type === 'city' ? state.lastLocation.value : null,
            state.lastLocation.type === 'coords' ? state.lastLocation.value : null
        )
        .then(updateUI)
        .catch(showError)
        .finally(hideLoading);
    }
}

function showLoading() {
    elements.loadingOverlay.style.display = 'grid';
    document.body.style.pointerEvents = 'none';
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
    document.body.style.pointerEvents = 'auto';
}

function showError(message) {
    elements.errorContainer.textContent = message;
    elements.errorContainer.classList.add('visible');
    setTimeout(() => elements.errorContainer.classList.remove('visible'), 3000);
    hideLoading();
}