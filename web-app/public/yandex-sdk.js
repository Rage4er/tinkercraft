/**
 * Интеграция с Yandex Games SDK
 * Реализация согласно документации Яндекс Игр
 * @module yandex-sdk
 */

/* global YaGames */

import { CONFIG } from './config.js';
import { logger } from './utils.js';

/**
 * Менеджер Яндекс Игр SDK
 * Обрабатывает инициализацию, геймплей, рекламу и события
 */
export class YandexSDKManager {
    constructor(onMetricCallback = null) {
        this.ysdk = null;
        this.player = null;
        this.isGamePaused = false;
        this.gameplayActive = false;
        this.onPauseCallbacks = [];
        this.onResumeCallbacks = [];
        this.onMetric = onMetricCallback;
        this.initialized = false;

        // ✅ Заранее привязанные методы для корректной отписки
        this._boundHandlePause = this._handlePause.bind(this);
        this._boundHandleResume = this._handleResume.bind(this);
        this._boundHandleBackButton = this._handleBackButton.bind(this);
    }

    /**
     * Инициализация SDK
     * @returns {Promise<boolean>} Успешность инициализации
     *
     * @example
     * const sdk = new YandexSDKManager();
     * await sdk.initialize();
     */
    async initialize() {
        if (this.initialized) return true;

        try {
            // Проверка наличия YaGames (требуется согласно sdk.md)
            // eslint-disable-next-line no-undef
            if (typeof YaGames === 'undefined') {
                logger.warn('YaGames не найден (локальная разработка?)');
                return false;
            }

            // Инициализация SDK (скрипт должен быть подключён до вызова)
            this.ysdk = await YaGames.init();
            logger.info('Yandex SDK инициализирован');

            // Загрузка игрока с обработкой ошибок
            try {
                this.player = await this.ysdk.getPlayer();
                logger.info('Игрок авторизован:', this.player.getName());
            } catch (error) {
                logger.info('Игрок не авторизован (гостевой режим)');
                this.player = null;
            }

            // Подписка на события (обязательно для модерации)
            this._subscribeToEvents();

            // LoadingAPI.ready() вызывается после полной загрузки игры
            // Вызывается в game.js после initialize()
            // this.ysdk.features.LoadingAPI?.ready();

            this.initialized = true;
            return true;

        } catch (error) {
            logger.error('Ошибка инициализации Yandex SDK:', error);
            return false;
        }
    }

    /**
     * Подписка на события SDK
     * @private
     */
    _subscribeToEvents() {
        if (!this.ysdk) return;

        try {
            // ✅ Использование привязанных методов для корректной отписки
            this.ysdk.on('game_api_pause', this._boundHandlePause);
            this.ysdk.on('game_api_resume', this._boundHandleResume);

            // Событие выхода (кнопка Back на TV)
            if (this.ysdk.EVENTS && this.ysdk.EVENTS.HISTORY_BACK) {
                this.ysdk.on(this.ysdk.EVENTS.HISTORY_BACK, this._boundHandleBackButton);
            }

            logger.info('События Yandex SDK подписаны');
        } catch (error) {
            logger.error('Ошибка подписки на события Yandex SDK:', error);
        }
    }

    /**
     * Обработка паузы игры
     * Останавливает звук и геймплей при сворачивании окна/вкладки
     * @private
     */
    _handlePause() {
        logger.info('Игра на паузе (game_api_pause)');
        this.isGamePaused = true;

        // Остановка геймплея (требуется для разметки геймплея)
        if (this.gameplayActive) {
            this.ysdk.features.GameplayAPI?.stop();
            this.gameplayActive = false;
        }

        // Уведомление подписчиков (для остановки звука)
        this.onPauseCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                logger.error('Ошибка в callback паузы:', error);
            }
        });
    }

    /**
     * Обработка возобновления игры
     * Возобновляет звук и геймплей при разворачивании окна/вкладки
     * @private
     */
    _handleResume() {
        logger.info('Игра возобновлена (game_api_resume)');
        this.isGamePaused = false;

        // Возобновление геймплея
        if (!this.gameplayActive) {
            this.ysdk.features.GameplayAPI?.start();
            this.gameplayActive = true;
        }

        // Уведомление подписчиков (для возобновления звука)
        this.onResumeCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                logger.error('Ошибка в callback возобновления:', error);
            }
        });
    }

    /**
     * Обработка кнопки "Назад" (для TV приставок)
     * @private
     */
    _handleBackButton() {
        logger.info('Нажата кнопка Back');
        // Показываем диалог подтверждения выхода
        if (confirm('Вы действительно хотите выйти из игры?')) {
            this.ysdk.dispatchEvent(this.ysdk.EVENTS.EXIT);
        } else {
            // Возвращаемся в игру
            this._handleResume();
        }
    }

    /**
     * Подписка на событие паузы
     * @param {Function} callback - Функция обратного вызова
     */
    onPause(callback) {
        if (typeof callback === 'function') {
            this.onPauseCallbacks.push(callback);
        }
    }

    /**
     * Подписка на событие возобновления
     * @param {Function} callback - Функция обратного вызова
     */
    onResume(callback) {
        if (typeof callback === 'function') {
            this.onResumeCallbacks.push(callback);
        }
    }

    /**
     * Начало геймплея
     * Вызывается при запуске уровня, закрытии меню, возобновлении после рекламы
     */
    startGameplay() {
        if (this.gameplayActive) return;

        this.ysdk?.features.GameplayAPI?.start();
        this.gameplayActive = true;
        logger.debug('Геймплей начат');
    }

    /**
     * Остановка геймплея
     * Вызывается при паузе, открытии меню, показе рекламы
     */
    stopGameplay() {
        if (!this.gameplayActive) return;

        this.ysdk?.features.GameplayAPI?.stop();
        this.gameplayActive = false;
        logger.debug('Геймплей остановлен');
    }

    /**
     * Показ полноэкранной рекламы
     * @returns {Promise<boolean>} Была ли показана реклама
     *
     * @example
     * const wasShown = await yandexSDK.showFullscreenAd();
     * if (wasShown) { /* возобновить игру *\/ }
     */
    async showFullscreenAd() {
        if (!this.ysdk) return false;

        return new Promise((resolve) => {
            // ✅ Единая функция для завершения Promise (защита от двойного вызова)
            let settled = false;
            const settle = (value) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve(value);
                }
            };

            // ✅ Таймаут для защиты от зависания (30 секунд)
            const timeoutId = setTimeout(() => {
                logger.warn('Таймаут полноэкранной рекламы (30с)');
                settle(false);
            }, 30000);

            try {
                this.ysdk.adv.showFullscreenAdv({
                    callbacks: {
                        onOpen: () => {
                            logger.info('Реклама открыта');
                        },
                        onClose: (wasShown) => {
                            logger.info('Реклама закрыта, показана:', wasShown);
                            this.onResumeCallbacks.forEach(callback => {
                                try { callback(); } catch (e) { logger.error('Ошибка в callback возобновления рекламы:', e); }
                            });
                            // Возобновление геймплея только если игра не на паузе
                            if (wasShown && !this.isGamePaused) {
                                setTimeout(() => this.startGameplay(), 500);
                            }
                            settle(wasShown);
                        },
                        onError: (error) => {
                            logger.warn('Ошибка полноэкранной рекламы:', error);
                            settle(false);
                        }
                    }
                });
            } catch (error) {
                logger.error('Критическая ошибка полноэкранной рекламы:', error);
                settle(false);
            }
        });
    }

    /**
     * Показ rewarded рекламы (с вознаграждением)
     * @returns {Promise<boolean>} Получено ли вознаграждение
     *
     * @example
     * const rewarded = await yandexSDK.showRewardedVideo();
     * if (rewarded) { /* выдать награду *\/ }
     */
    async showRewardedVideo() {
        if (!this.ysdk) return false;

        return new Promise((resolve) => {
            // ✅ Единая функция для завершения Promise (защита от двойного вызова)
            let settled = false;
            const settle = (value) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve(value);
                }
            };

            // ✅ Таймаут для защиты от зависания (60 секунд)
            const timeoutId = setTimeout(() => {
                logger.warn('Таймаут rewarded видео (60с)');
                settle(false);
            }, 60000);

            try {
                this.ysdk.adv.showRewardedVideo({
                    callbacks: {
                        onOpen: () => {
                            logger.info('Rewarded видео открыто');
                            this.stopGameplay();
                            this.onPauseCallbacks.forEach(callback => {
                                try { callback(); } catch (e) { logger.error('Ошибка в callback паузы rewarded рекламы:', e); }
                            });
                        },
                        onRewarded: () => {
                            logger.info('Вознаграждение получено!');
                            // ✅ Отправка события в Яндекс.Метрику
                            if (typeof this.onMetric === 'function') {
                                this.onMetric('ad_watched');
                            }
                            settle(true);
                        },
                        onClose: () => {
                            logger.info('Rewarded видео закрыто');
                            this.onResumeCallbacks.forEach(callback => {
                                try { callback(); } catch (e) { logger.error('Ошибка в callback возобновления rewarded рекламы:', e); }
                            });
                            // Возобновление геймплея
                            if (!this.isGamePaused) {
                                setTimeout(() => this.startGameplay(), 500);
                            }
                            // Если ещё не было вознаграждения
                            settle(false);
                        },
                        onError: (error) => {
                            logger.warn('Ошибка rewarded видео:', error);
                            settle(false);
                        }
                    }
                });
            } catch (error) {
                logger.error('Критическая ошибка rewarded видео:', error);
                settle(false);
            }
        });
    }

    /**
     * Получение объекта игрока
     * @returns {Object|null}
     */
    getPlayer() {
        return this.player;
    }

    /**
     * Проверка авторизации игрока
     * @returns {boolean}
     */
    isAuthorized() {
        return this.player !== null;
    }

    /**
     * Получение основного SDK объекта
     * @returns {Object|null}
     */
    getSDK() {
        return this.ysdk;
    }

    /**
     * Получение объекта платежей
     * @returns {Promise<Object|null>}
     */
    async getPayments() {
        if (!this.ysdk) return null;

        try {
            return await this.ysdk.getPayments();
        } catch (error) {
            logger.warn('Платежи не доступны:', error);
            return null;
        }
    }

    /**
     * Проверка необработанных покупок
     * @returns {Promise<Array>} Список покупок
     */
    async checkPurchases() {
        const payments = await this.getPayments();
        if (!payments) return [];

        try {
            return await payments.getPurchases();
        } catch (error) {
            logger.warn('Не удалось получить покупки:', error);
            return [];
        }
    }

    /**
     * Получение информации об окружении
     * @returns {Object} app.id, i18n.lang, i18n.tld, payload
     */
    getEnvironment() {
        return this.ysdk?.environment || {
            app: { id: 'local' },
            i18n: { lang: 'ru', tld: 'ru' },
            payload: ''
        };
    }

    /**
     * Получение серверного времени (защищено от накруток)
     * @returns {number} Timestamp в миллисекундах
     */
    getServerTime() {
        return this.ysdk?.serverTime() || Date.now();
    }

    /**
     * Информация об устройстве
     * @returns {Object} type, isMobile, isDesktop, isTablet, isTV
     */
    getDeviceInfo() {
        const deviceInfo = this.ysdk?.deviceInfo || {};
        return {
            type: deviceInfo.type || 'desktop',
            isMobile: deviceInfo.isMobile?.() || false,
            isDesktop: deviceInfo.isDesktop?.() || true,
            isTablet: deviceInfo.isTablet?.() || false,
            isTV: deviceInfo.isTV?.() || false
        };
    }

    /**
     * Очистка ресурсов SDK
     * Вызывается при уничтожении игры
     */
    dispose() {
        try {
            // Остановка геймплея
            if (this.gameplayActive) {
                this.stopGameplay();
            }

            // ✅ Корректная отписка с использованием привязанных методов
            if (this.ysdk) {
                this.ysdk.off('game_api_pause', this._boundHandlePause);
                this.ysdk.off('game_api_resume', this._boundHandleResume);
                if (this.ysdk.EVENTS && this.ysdk.EVENTS.HISTORY_BACK) {
                    this.ysdk.off(this.ysdk.EVENTS.HISTORY_BACK, this._boundHandleBackButton);
                }
            }

            this.onPauseCallbacks = [];
            this.onResumeCallbacks = [];
            this.ysdk = null;
            this.player = null;
            this.initialized = false;
            logger.info('Yandex SDK очищен');
        } catch (error) {
            logger.error('Ошибка при очистке Yandex SDK:', error);
        }
    }
}

export default YandexSDKManager;
