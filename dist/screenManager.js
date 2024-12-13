// ui.ts
import { BugDisplay } from "./bugDisplay.js";
import { SAMPLE_SIDES } from "./config.js";
import { LocationTracker } from "./utils/locationTracker.js";
import { timer } from "./utils/timer.js";
export class ScreenManager {
    currentScreen;
    screens;
    bugDisplay;
    sessionSetup;
    samples;
    constructor() {
        this.currentScreen = 'session-form-screen';
        this.screens = new Map();
        this.bugDisplay = new BugDisplay(document.getElementById('bugGrid'));
        this.sessionSetup = null;
        this.samples = [];
        this.initialize_screens();
        this.run();
    }
    // screen management
    initialize_screens() {
        // add screens to map
        document.querySelectorAll('[data-screen]').forEach(element => {
            const screenName = element.dataset.screen;
            this.screens.set(screenName, element);
        });
        // hide all screens
        this.screens.forEach(element => {
            element.style.display = 'none';
        });
    }
    toggleScreen(show) {
        let curr = this.screens.get(this.currentScreen);
        if (curr) {
            curr.style.display = show ? 'block' : 'none';
        }
        else {
            console.error(`Screen ${this.currentScreen} not found`);
        }
    }
    showScreen(name) {
        console.log(`showing screen ${name}`);
        this.toggleScreen(false);
        this.currentScreen = name;
        this.toggleScreen(true);
    }
    // event handling
    async run() {
        this.toggleScreen(true);
        let locationTracker = new LocationTracker();
        // undo button
        document.getElementById('undoButton')?.addEventListener('click', () => {
            console.log("undo clicked");
            this.bugDisplay?.undo();
        });
        this.sessionSetup = await awaitForm('sessionForm', () => {
            console.log("session form submitted");
            return {
                date: new Date(),
                location: locationTracker.getCurrentLocation(),
                site: document.getElementById('site').value,
                treatment: document.getElementById('treatment').value,
                sampleAmount: parseInt(document.getElementById('treeAmount').value),
            };
        });
        let sampleAmount = this.sessionSetup.sampleAmount;
        console.log("Got session setup", this.sessionSetup);
        this.samples = Array(sampleAmount).fill(null).map(() => Object.fromEntries(SAMPLE_SIDES.map(side => [side, null])));
        // populate the sample selection screen
        let sampleSelectionElement = document.getElementById('sample-selection-grid');
        console.log("Got sample selection element", sampleSelectionElement);
        populateSampleSelectionScreen(sampleSelectionElement, sampleAmount, (row, col) => {
            this.startSample(row, col);
        });
        this.showScreen('sample-selection-screen');
    }
    async startSample(row, col) {
        console.log(`Starting sample ${row}${col}`);
        // Set the title to the correct sample name.
        let sequence = document.getElementsByClassName('sample-name');
        console.log("sequence", sequence);
        let name = `Tree ${col}, ${row}`;
        Array.from(sequence).forEach(e => e.textContent = name);
        console.log("name", name);
        this.showScreen('sample-form-screen');
        let sample_setup = await awaitForm('sampleForm', () => {
            console.log("sample form submitted");
            return {
                phenologicalState: parseInt(document.getElementById('PhenologicalState').value),
                femaleFlowerPercentage: parseInt(document.getElementById('FemaleFlowerPercentage').value),
                samplingLength: parseInt(document.getElementById('samplingLength').value),
            };
        });
        console.log("Got sample setup", sample_setup);
        this.bugDisplay = new BugDisplay(document.getElementById('bugGrid'));
        this.showScreen('sample-screen');
        // wait for timer to finish
        console.log(`Starting timer for ${sample_setup.samplingLength} seconds`);
        await timer(document.getElementById('timer'), sample_setup.samplingLength);
        // clear previous comments
        document.getElementById('comments').value = '';
        this.showScreen('comments-screen');
        const comments = await awaitForm('commentsForm', () => {
            return document.getElementById('comments').value;
        });
        // store sample results
        this.samples[col - 1][row] = {
            phenologicalState: sample_setup.phenologicalState,
            femaleFlowerPercentage: sample_setup.femaleFlowerPercentage,
            samplingLength: sample_setup.samplingLength,
            counts: this.bugDisplay.getCounts(),
            comments,
        };
        if (this.samples.every(row => SAMPLE_SIDES.every(side => row[side] !== null))) {
            console.log("All samples collected", this.sessionSetup, this.samples);
            // this.downloadCsv('bugs.csv', this.generateFullCsv(session_setup, this.samples as Sample[][]));
            this.showScreen('session-form-screen');
        }
        else {
            this.showScreen('sample-selection-screen');
        }
    }
    generateFullCsv(setup, samples) {
        // // TODO needs hour also, probably.
        // const setupInfo = `Date,${setup.date}\nLocation,${setup.location}\nSite,${setup.site}\nType,${setup.treatment}\n\n`;
        // const sampleInfo = samples.map(sample => {
        //     return `Phenological State,${sample.phenologicalState}\nFemale Flower Percentage,${sample.femaleFlowerPercentage}\n${bugs.map((bug, index) => `${bug.name},${sample.counts[index]}`).join('\n')}\n`;
        // }).join('\n');
        // return setupInfo + sampleInfo;
        return "";
    }
    downloadCsv(filename, content) {
        // const blob = new Blob([content], { type: 'text/csv' });
        // const a = document.createElement('a');
        // a.href = URL.createObjectURL(blob);
        // a.download = filename;
        // a.click();
    }
}
function awaitForm(form, handler) {
    console.log(`awaiting form ${form}`);
    return new Promise(resolve => {
        document.getElementById(form).addEventListener('submit', (e) => {
            e.preventDefault();
            resolve(handler());
        }, { once: true });
    });
}
function populateSampleSelectionScreen(grid, sampleAmount, startSample) {
    // Set grid columns CSS variable
    document.documentElement.style.setProperty('--grid-columns', sampleAmount.toString());
    // Empty cell for top-left corner
    const cornerCell = document.createElement('div');
    grid.appendChild(cornerCell);
    // Column numbers
    for (let i = 1; i <= sampleAmount; i++) {
        const cell = document.createElement('div');
        cell.className = 'col-label';
        cell.textContent = i.toString();
        grid.appendChild(cell);
    }
    // Sample rows
    SAMPLE_SIDES.forEach(row => {
        const label = document.createElement('div');
        label.className = 'row-label';
        label.textContent = row;
        grid.appendChild(label);
        // Sample cells
        for (let col = 1; col <= sampleAmount; col++) {
            const cell = document.createElement('div');
            cell.className = 'sample-cell';
            cell.textContent = `${row}${col}`;
            cell.dataset.id = `${row}${col}`;
            cell.addEventListener('click', () => {
                cell.classList.add('completed');
                startSample(row, col);
            }, { once: true });
            grid.appendChild(cell);
        }
    });
}
