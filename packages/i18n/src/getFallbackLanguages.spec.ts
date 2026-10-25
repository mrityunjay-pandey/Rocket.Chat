import i18next from 'i18next';

import { getFallbackLanguages } from './index';

describe('getFallbackLanguages', () => {
	it.each([
		['en', ['en']],
		['pt', ['en']],
		['pt-BR', ['pt', 'en']],
		['de-AT', ['de', 'en']],
		['zh', ['en']],
		['zh-TW', ['en']],
		['zh-HK', ['zh-TW', 'en']],
	])('falls back from %s to %j', (language, expected) => {
		expect(getFallbackLanguages(language)).toEqual(expected);
	});
});

describe('i18next with getFallbackLanguages', () => {
	const createInstance = async (lng: string) => {
		const instance = i18next.createInstance();
		await instance.init({
			lng,
			load: 'currentOnly',
			fallbackLng: getFallbackLanguages,
			resources: {
				'en': { translation: { Settings: 'Settings (en)', Language: 'Language (en)' } },
				'de': { translation: { Settings: 'Einstellungen', Language: 'Sprache' } },
				'de-AT': { translation: { Language: 'Sprache (AT)' } },
				'zh': { translation: { Settings: '设置', Language: '语言' } },
				'zh-TW': { translation: { Language: '語言' } },
				'zh-HK': { translation: {} },
			},
		});
		return instance;
	};

	it('shows untranslated Traditional Chinese keys in English, not Simplified Chinese', async () => {
		const instance = await createInstance('zh-TW');

		expect(instance.t('Language')).toBe('語言');
		expect(instance.t('Settings')).toBe('Settings (en)');
	});

	it('fills Hong Kong Chinese from Taiwan Chinese before English', async () => {
		const instance = await createInstance('zh-HK');

		expect(instance.t('Language')).toBe('語言');
		expect(instance.t('Settings')).toBe('Settings (en)');
	});

	it('keeps falling back from a regional locale to its base language', async () => {
		const instance = await createInstance('de-AT');

		expect(instance.t('Language')).toBe('Sprache (AT)');
		expect(instance.t('Settings')).toBe('Einstellungen');
	});
});
