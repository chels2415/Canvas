import browser from 'webextension-polyfill';

import { NullIfEmpty, SavedFields, Options } from './';
import { SupportedTypes, CONFIGURATION } from './configuration';
import { ValidatorConstructor, InputFieldValidator } from './validator';

class InputElement {
	id: string;
	element: HTMLElement | null;

	constructor(id: string) {
		this.id = id;
		this.element = document.getElementById(id);
	}

	private static isValid(element: HTMLElement | null): element is HTMLInputElement | HTMLTextAreaElement {
		return (Boolean(element) && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement));
	}

	private static useChecked(element: HTMLInputElement | HTMLTextAreaElement) {
		return (element.type === 'checkbox' || element.type === 'radio');
	}

	public getValue(): SupportedTypes | void {
		if (!InputElement.isValid(this.element)) return;

		if (this.element instanceof HTMLInputElement && InputElement.useChecked(this.element)) {
			return this.element.checked;
		}

		return this.element.value.trim() || null;
	}

	public setValue(value: SupportedTypes) {
		if (!InputElement.isValid(this.element)) return;

		if (value == null) return;

		if (this.element instanceof HTMLInputElement && InputElement.useChecked(this.element) && typeof value === 'boolean') {
			return this.element.checked = value;
		}

		if (typeof value === 'string') {
			return this.element.value = value;
		}

		throw new Error(`Failed to set unexpected value ${value} of type ${typeof value} on element ${this.id}`);
	}
}

async function getFields(): Promise<SavedFields> {
	const fieldsWithDefaultValues = Object.fromEntries(
		Object.entries(CONFIGURATION.FIELDS).map(([field, { defaultValue }]) => [field, defaultValue]),
	);

	return await <Promise<SavedFields>>browser.storage.local.get(fieldsWithDefaultValues);
}

export async function getOptions(): Promise<Options> {
	const savedFields = await getFields();

	return {
		timeZone: savedFields['timeZone'],
		popup: {
			displayJSONButton: savedFields['popup.displayJSONButton'],
		},
		canvas: {
			timeZone: savedFields['timeZone'],
			classNames: {
				breadcrumbs: savedFields['canvas.classNames.breadcrumbs'],
				assignment: savedFields['canvas.classNames.assignment'],
				title: savedFields['canvas.classNames.title'],
				availableDate: savedFields['canvas.classNames.availableDate'],
				availableStatus: savedFields['canvas.classNames.availableStatus'],
				dueDate: savedFields['canvas.classNames.dueDate'],
				dateElement: savedFields['canvas.classNames.dateElement'],
			},
			classValues: {
				courseCodeN: Number(savedFields['canvas.classValues.courseCodeN']),
				notAvailable: savedFields['canvas.classValues.notAvailable'],
			},
			selectors: {
				get courseCode() { return `.${savedFields['canvas.classNames.breadcrumbs']} li:nth-of-type(${savedFields['canvas.classValues.courseCodeN']}) span`; },
				get availableStatus() { return `.${savedFields['canvas.classNames.availableDate']} .${savedFields['canvas.classNames.availableStatus']}`; },
				get availableDate() { return `.${savedFields['canvas.classNames.availableDate']} .${savedFields['canvas.classNames.dateElement']}`; },
				get dueDate() { return `.${savedFields['canvas.classNames.dueDate']} .${savedFields['canvas.classNames.dateElement']}`; },
			},
			courseCodeOverrides: JSON.parse(savedFields['canvas.courseCodeOverrides']),
		},
		notion: {
			timeZone: savedFields['timeZone'],
			notionKey: savedFields['notion.notionKey'],
			databaseId: savedFields['notion.databaseId'],
			propertyNames: {
				name: savedFields['notion.propertyNames.name'],
				category: savedFields['notion.propertyNames.category'],
				course: savedFields['notion.propertyNames.course'],
				url: savedFields['notion.propertyNames.url'],
				status: savedFields['notion.propertyNames.status'],
				available: savedFields['notion.propertyNames.available'],
				due: savedFields['notion.propertyNames.due'],
				span: savedFields['notion.propertyNames.span'],
			},
			propertyValues: {
				categoryCanvas: savedFields['notion.propertyValues.categoryCanvas'],
				statusToDo: savedFields['notion.propertyValues.statusToDo'],
			},
			courseEmojis: JSON.parse(savedFields['notion.courseEmojis']),
		},
	};
}

async function restoreOptions() {
	const savedFields = await getFields();

	Object.entries(savedFields).forEach(([field, value]) => {
		const fieldElementId = CONFIGURATION.FIELDS[<keyof typeof savedFields>field].elementId;
		new InputElement(fieldElementId).setValue(value);
	});
}

async function validateElementInput(elementId: string, Validator: ValidatorConstructor) {
	const inputValue = new InputElement(elementId).getValue() ?? null;

	// boolean values are always valid
	if (typeof inputValue === 'boolean') return inputValue;

	return await new Validator(elementId, inputValue).validate();
}

async function getFieldInputs(): Promise<Record<keyof SavedFields, NullIfEmpty<string>> | null> {
	const fieldEntries = Object.fromEntries(
		await Promise.all(
			Object.entries(CONFIGURATION.FIELDS).map(async ([field, { elementId, Validator }]) => {
				const validatedInput = (Validator)
					? await validateElementInput(elementId, Validator)
					: new InputElement(elementId).getValue();
				return [field, validatedInput];
			}),
		),
	);

	if (Object.values(fieldEntries).every(value => value !== InputFieldValidator.INVALID_INPUT)) return <Record<keyof SavedFields, NullIfEmpty<string>>>fieldEntries;

	return null;
}

async function saveOptions() {
	const fieldEntries = await getFieldInputs();

	if (fieldEntries) {
		await browser.storage.local.set(fieldEntries);

		if (saveButton) {
			saveButton.innerHTML = 'Saved!';

			setTimeout(() => {
				saveButton.innerHTML = 'Save';
			}, 1325);
		}

		restoreOptions();
	}
}

document.addEventListener('DOMContentLoaded', restoreOptions);

// validate fields on input
Object.values(CONFIGURATION.FIELDS).forEach(({ elementId, Validator, validateOn = 'input' }) => {
	if (Validator) document.getElementById(elementId)?.addEventListener(validateOn, () => validateElementInput(elementId, Validator));
});

const saveButton = document.getElementById('save-button');
if (saveButton) saveButton.addEventListener('click', saveOptions);

document.addEventListener('keydown', keyEvent => {
	if (keyEvent.ctrlKey && keyEvent.key === 's') {
		keyEvent.preventDefault();
		saveOptions();
	}
});

// hide all canvas class options
// TODO: sort out this interface / do i still need this as a configurable option?
const canvasClassNames = document.getElementById('canvas-class-names');
if (canvasClassNames) canvasClassNames.style.display = 'none';