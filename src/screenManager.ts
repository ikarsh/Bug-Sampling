import { BugDisplay } from "./bugDisplay.js";
import { SAMPLE_SIDES } from "./config.js";
import { generateAndDownloadCsv } from "./csvGenerator.js";
import { SessionStateManager } from "./sessionState.js";
import { Sample, SampleSide, SessionSetup, Treatment } from "./types.js";
import { LocationTracker } from "./utils/locationTracker.js";
import { timer } from "./utils/timer.js";

export type Screen = 'session-form-screen' | 'sample-selection-screen' | 'sample-form-screen' | 'sample-screen' | 'comments-screen';

export class ScreenManager {
    private currentScreen: Screen;
    private screens: Map<Screen, HTMLElement>;
    private bugDisplay: BugDisplay;
    private stateManager: SessionStateManager;
    
    constructor() {
        this.stateManager = new SessionStateManager();
        this.bugDisplay = new BugDisplay(document.getElementById('bugGrid')!);
        
        this.screens = new Map();
        this.initialize_screens();
        this.currentScreen = this.stateManager.getCurrentScreen() as Screen;

        this.initializeButtons();

        // If we have existing session setup, skip to sample selection
        const existingSetup = this.stateManager.getSetup();
        if (existingSetup) {
            this.setupSampleSelection();
        } else {
            this.selectSessionSetup();
        }
    }

    // screen management

    private initialize_screens() {
        // add screens to map
        document.querySelectorAll<HTMLElement>('[data-screen]').forEach(element => {
            const screenName = element.dataset.screen as Screen;
            this.screens.set(screenName, element);
        });
        
        // hide all screens
        this.screens.forEach(element => {
            element.style.display = 'none';
        });
    }
    
    toggleScreen(show: boolean) {
        let curr = this.screens.get(this.currentScreen);
        if (curr) {
            curr.style.display = show ? 'block' : 'none';
        }
        else {
            console.error(`Screen ${this.currentScreen} not found`);
        }
    }

    showScreen(name: Screen) {
        console.log(`showing screen ${name}`);
        this.toggleScreen(false);
        this.currentScreen = name;
        this.stateManager.setCurrentScreen(name);
        this.toggleScreen(true);
    }

    // event handling

    private initializeButtons() {
        // undo button
        let undoButton = clean_listeners(document.getElementById('undoButton')!);
        undoButton.addEventListener('click', () => {
            console.log("undo clicked");
            this.bugDisplay?.undo();
        });

        // reset button
        let resetButton = clean_listeners(document.getElementById('resetButton')!);
        resetButton.addEventListener('click', () => {
            if (confirm('Are you sure? This will delete all collected data.')) {
                this.reset();
            }
        });
    }

    private reset() {
        this.stateManager.clearSession();
        window.location.reload();
    }

    private async selectSessionSetup() {
        this.showScreen('session-form-screen');
        let locationTracker = new LocationTracker();
        const sessionSetup = await awaitForm('sessionForm', () => {
            console.log("session form submitted");
            return {
                date: new Date(),
                location: locationTracker.getCurrentLocation(),
                site: (document.getElementById('site') as HTMLSelectElement).value as SessionSetup['site'],
                treatment: (document.getElementById('treatment') as HTMLSelectElement).value as Treatment,
                sampleAmount: parseInt((document.getElementById('treeAmount') as HTMLInputElement).value),
            } as SessionSetup;
        });
        console.log("Got session setup", sessionSetup);

        this.stateManager.setSetup(sessionSetup);
        this.setupSampleSelection();
    }

    private setupSampleSelection() {
        // this can be more efficient, not re-rendering the whole grid every time
        let sampleSelectionElement = document.getElementById('sample-selection-grid')!;
        const sessionSetup = this.stateManager.getSetup()!;
        let sampleAmount = sessionSetup.sampleAmount;
        const completionGrid = this.stateManager.getCompletionGrid()!;
        
        populateSampleSelectionScreen(
            sampleSelectionElement, 
            sampleAmount, 
            (row, col) => this.startSample(row, col),
            completionGrid
        );
        this.showScreen('sample-selection-screen');
    }

    private async startSample(row: SampleSide, col: number) {
        console.log(`Starting sample ${row}${col}`);

        // Set the title to the correct sample name.
        let sequence = document.getElementsByClassName('sample-name')
        let name = `${col}, ${row}`;
        Array.from(sequence).forEach(e => (e as HTMLElement).textContent = name);

        this.showScreen('sample-form-screen');

        let sample_setup = await awaitForm('sampleForm', () => {
            console.log("sample form submitted");
            return {
                phenologicalState: parseInt((document.getElementById('PhenologicalState') as HTMLInputElement).value),
                femaleFlowerPercentage: parseInt((document.getElementById('FemaleFlowerPercentage') as HTMLInputElement).value),
                samplingLength: parseInt((document.getElementById('samplingLength') as HTMLInputElement).value),
            };
        });
        console.log("Got sample setup", sample_setup);

        this.bugDisplay = new BugDisplay(document.getElementById('bugGrid')!);
        this.showScreen('sample-screen');
        // wait for timer to finish
        console.log(`Starting timer for ${sample_setup.samplingLength} seconds`);
        await timer(document.getElementById('timer')!, sample_setup.samplingLength);

        // clear previous comments
        (document.getElementById('comments') as HTMLTextAreaElement).value = '';
        
        this.showScreen('comments-screen');
        const comments = await awaitForm('commentsForm', () => {
            return (document.getElementById('comments') as HTMLTextAreaElement).value;
        });


        // store sample results
        const sample = {
            phenologicalState: sample_setup.phenologicalState,
            femaleFlowerPercentage: sample_setup.femaleFlowerPercentage,
            samplingLength: sample_setup.samplingLength,
            counts: this.bugDisplay.getCounts(),
            comments,
        } as Sample;

        this.stateManager.setSample(col - 1, row, sample);
        let samples = this.stateManager.getSamples();
        if (this.stateManager.allSamplesCollected()) {
            console.log("All samples collected", samples);
            const setup = this.stateManager.getSetup()!;
            console.log("Generating Excel");
            generateAndDownloadCsv(setup, samples as Record<SampleSide, Sample>[]);
            this.reset();
            console.log("Excel generated and downloaded");
        } else {
            this.setupSampleSelection();
        }
    }
}

function awaitForm<T>(form: string, handler: () => T): Promise<T> {
    console.log(`awaiting form ${form}`);
    return new Promise(resolve => {
        let formElement = clean_listeners(document.getElementById(form)!);
        formElement.addEventListener('submit', (e) => {
            e.preventDefault();
            resolve(handler());
        }, { once: true });
    });
}

function populateSampleSelectionScreen(
    grid: HTMLElement, 
    sampleAmount: number, 
    startSample: (row: SampleSide, col: number) => void,
    completionGrid: Record<SampleSide, Sample | boolean>[]
) {
    // Set grid columns CSS variable
    document.documentElement.style.setProperty('--grid-columns', sampleAmount.toString());
    
    grid.innerHTML = '';
    
    const cornerCell = document.createElement('div');
    grid.appendChild(cornerCell);
    
    // Column numbers
    for (let i = 1; i <= sampleAmount; i++) {
        const cell = document.createElement('div');
        cell.className = 'col-label';
        cell.textContent = i.toString();
        grid.appendChild(cell);
    }

    // Row names
    SAMPLE_SIDES.forEach(row => {
        const label = document.createElement('div');
        label.className = 'row-label';
        label.textContent = row;
        grid.appendChild(label);
        
        for (let col = 1; col <= sampleAmount; col++) {
            const cell = document.createElement('div');
            cell.className = 'sample-cell';
            cell.textContent = `🌳`;
            
            if (completionGrid[col - 1][row]) {
                cell.classList.add('completed');
            } else {
                // this is fine as the grid is re-rendered every time. But it is fishy.
                cell.addEventListener('click', () => {
                    cell.classList.add('completed');
                    startSample(row, col);
                }, { once: true });
            }
            grid.appendChild(cell);
        }
    });
}

function clean_listeners(element: HTMLElement) {
    const clone = element.cloneNode(true);
    element.parentNode!.replaceChild(clone, element);
    return clone as HTMLElement;
}