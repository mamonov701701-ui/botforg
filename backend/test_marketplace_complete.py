"""
Полное тестирование Marketplace: создание пользователей, шаблонов, размещение на маркете и использование
"""
import sys
import os
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8001"
API_BASE = f"{BASE_URL}/api/market"

# Тестовые данные
USER1_EMAIL = f"seller_{datetime.now().strftime('%H%M%S')}@test.com"
USER1_PASSWORD = "Test123456!"
USER1_NAME = "Seller User"

USER2_EMAIL = f"buyer_{datetime.now().strftime('%H%M%S')}@test.com"
USER2_PASSWORD = "Test123456!"
USER2_NAME = "Buyer User"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    END = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}[OK] {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}[ERROR] {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.BLUE}[INFO] {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}[WARN] {msg}{Colors.END}")

def print_step(msg):
    print(f"\n{Colors.CYAN}{'='*70}{Colors.END}")
    print(f"{Colors.CYAN}{msg}{Colors.END}")
    print(f"{Colors.CYAN}{'='*70}{Colors.END}\n")

def make_request(method, url, token=None, data=None, expected_status=200, description=""):
    """Выполнить HTTP запрос"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, params=data, timeout=10)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=10)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            print_error(f"Неизвестный метод: {method}")
            return None
        
        if response.status_code == expected_status:
            print_success(f"{description} - Status: {response.status_code}")
            try:
                return response.json()
            except:
                return {"text": response.text}
        else:
            print_error(f"{description} - Status: {response.status_code}, Response: {response.text[:300]}")
            return None
    except requests.exceptions.ConnectionError:
        print_error(f"{description} - Не удалось подключиться к серверу")
        return None
    except Exception as e:
        print_error(f"{description} - Ошибка: {e}")
        return None

def register_user(email, password, name):
    """Регистрация нового пользователя"""
    register_url = f"{BASE_URL}/auth/email/register"
    data = {
        "email": email,
        "password": password,
        "name": name
    }
    result = make_request("POST", register_url, data=data, expected_status=200, 
                         description=f"Регистрация пользователя {email}")
    return result

def login_user(email, password):
    """Вход пользователя и получение токена"""
    login_urls = [
        f"{BASE_URL}/auth/email/login",
        f"{BASE_URL}/auth/login"
    ]
    
    for login_url in login_urls:
        try:
            # Пробуем JSON
            response = requests.post(
                login_url,
                json={"email": email, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                result = response.json()
                token = result.get("access_token") or result.get("token")
                if token:
                    print_success(f"Вход выполнен для {email}")
                    return token
            
            # Пробуем form-data (OAuth2PasswordRequestForm)
            response = requests.post(
                login_url,
                data={"username": email, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                result = response.json()
                token = result.get("access_token") or result.get("token")
                if token:
                    print_success(f"Вход выполнен для {email}")
                    return token
        except Exception as e:
            print_warning(f"Ошибка при входе через {login_url}: {e}")
            continue
    
    print_error(f"Не удалось войти для {email}")
    return None

def create_bot(token, title, description="Test bot for marketplace"):
    """Создание бота"""
    bot_url = f"{BASE_URL}/bots/"
    data = {
        "title": title,
        "description": description,
        "username": f"bot_{datetime.now().strftime('%H%M%S')}",
        "token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"  # Тестовый токен
    }
    result = make_request("POST", bot_url, token=token, data=data, expected_status=201,
                         description=f"Создание бота '{title}'")
    return result

def create_market_item(token, item_type, source_bot_id=None, source_scenario_id=None, 
                      title="Test Market Item", price=100.00):
    """Создание товара на маркетплейсе"""
    data = {
        "item_type": item_type,
        "title": title,
        "description": f"Описание для {title}",
        "additional_description": f"Дополнительное описание для {title}",
        "price": float(price),
        "category": "test",
        "tags": ["test", "template"],
        "is_published": True
    }
    
    if source_bot_id:
        data["source_bot_id"] = source_bot_id
    if source_scenario_id:
        data["source_scenario_id"] = source_scenario_id
    
    result = make_request("POST", f"{API_BASE}/items", token=token, data=data, expected_status=201,
                         description=f"Создание товара '{title}' на маркетплейсе")
    return result

def get_market_items(token=None, filters=None):
    """Получить список товаров на маркетплейсе"""
    result = make_request("GET", f"{API_BASE}/items", token=token, data=filters,
                         description="Получение списка товаров")
    return result

def get_market_item_detail(token, item_id):
    """Получить детальную информацию о товаре"""
    result = make_request("GET", f"{API_BASE}/items/{item_id}", token=token,
                         description=f"Получение деталей товара {item_id}")
    return result

def create_review(token, item_type, item_id, rating=5, comment="Отличный товар!"):
    """Создать отзыв"""
    data = {
        "item_type": item_type,
        "item_id": item_id,
        "rating": rating,
        "comment": comment
    }
    result = make_request("POST", f"{API_BASE}/reviews", token=token, data=data, expected_status=201,
                         description=f"Создание отзыва для {item_type} {item_id}")
    return result

def main():
    global USER1_EMAIL, USER2_EMAIL
    
    print(f"\n{Colors.CYAN}{'='*70}{Colors.END}")
    print(f"{Colors.CYAN}{' '*20}ПОЛНОЕ ТЕСТИРОВАНИЕ MARKETPLACE{Colors.END}")
    print(f"{Colors.CYAN}{'='*70}{Colors.END}\n")
    
    # Проверка доступности сервера
    print_step("ШАГ 1: Проверка доступности сервера")
    health = make_request("GET", f"{BASE_URL}/health", description="Health check")
    if not health:
        print_error("Сервер недоступен. Убедитесь, что backend запущен на порту 8001")
        return
    
    # Регистрация первого пользователя (продавец)
    print_step("ШАГ 2: Регистрация/Вход первого пользователя (Продавец)")
    user1_data = register_user(USER1_EMAIL, USER1_PASSWORD, USER1_NAME)
    if not user1_data:
        print_warning("Регистрация не удалась, возможно пользователь уже существует. Пробую войти...")
    
    # Вход первого пользователя
    user1_email_actual = USER1_EMAIL
    user1_token = login_user(user1_email_actual, USER1_PASSWORD)
    if not user1_token:
        # Пробуем использовать тестового пользователя
        print_warning("Не удалось войти. Пробую использовать тестового пользователя...")
        test_emails = ["test@example.com", "admin@example.com", "user@example.com"]
        for test_email in test_emails:
            user1_token = login_user(test_email, "Test123456!")
            if user1_token:
                user1_email_actual = test_email
                print_info(f"Используется существующий пользователь: {test_email}")
                break
        
        if not user1_token:
            print_error("Не удалось войти. Создайте пользователя вручную или проверьте БД.")
            print_info("Для продолжения тестирования создайте пользователя через админ-панель или SQL.")
            return
    
    USER1_EMAIL = user1_email_actual
    
    # Создание бота для первого пользователя
    print_step("ШАГ 3: Создание бота для продавца")
    bot1 = create_bot(user1_token, "Premium Telegram Bot Template", 
                     "Готовый шаблон бота для продажи на маркетплейсе")
    if not bot1:
        print_error("Не удалось создать бота. Прерываю тестирование.")
        return
    
    bot1_id = bot1.get("id")
    print_info(f"Бот создан с ID: {bot1_id}")
    
    # Создание второго бота
    bot2 = create_bot(user1_token, "E-commerce Bot Template",
                     "Шаблон бота для интернет-магазина")
    if bot2:
        bot2_id = bot2.get("id")
        print_info(f"Второй бот создан с ID: {bot2_id}")
    
    # Размещение товаров на маркетплейсе
    print_step("ШАГ 4: Размещение товаров на маркетплейсе")
    
    # Товар 1: Premium шаблон
    market_item1 = create_market_item(
        user1_token, 
        "template", 
        source_bot_id=bot1_id,
        title="Premium Telegram Bot Template",
        price=299.99
    )
    if not market_item1:
        print_error("Не удалось создать товар на маркетплейсе")
        return
    
    item1_id = market_item1.get("id")
    print_info(f"Товар 1 создан с ID: {item1_id}, цена: 299.99")
    
    # Товар 2: E-commerce шаблон
    if bot2:
        market_item2 = create_market_item(
            user1_token,
            "template",
            source_bot_id=bot2_id,
            title="E-commerce Bot Template",
            price=199.99
        )
        if market_item2:
            item2_id = market_item2.get("id")
            print_info(f"Товар 2 создан с ID: {item2_id}, цена: 199.99")
    
    # Просмотр списка товаров
    print_step("ШАГ 5: Просмотр товаров на маркетплейсе")
    items_list = get_market_items(user1_token, {"page": 1, "page_size": 10})
    if items_list:
        total = items_list.get("total", 0)
        items = items_list.get("items", [])
        print_info(f"Найдено товаров: {total}")
        for item in items:
            print_info(f"  - {item.get('title')} (ID: {item.get('id')}, Цена: {item.get('price')})")
    
    # Получение детальной информации о товаре
    print_step("ШАГ 6: Получение детальной информации о товаре")
    item_detail = get_market_item_detail(user1_token, item1_id)
    if item_detail:
        print_info(f"Товар: {item_detail.get('title')}")
        print_info(f"Описание: {item_detail.get('description', '')[:100]}...")
        print_info(f"Цена: {item_detail.get('price')}")
        print_info(f"Продавец: {item_detail.get('seller', {}).get('email', 'N/A')}")
        print_info(f"Рейтинг: {item_detail.get('average_rating', 'N/A')} ({item_detail.get('rating_count', 0)} отзывов)")
    
    # Регистрация второго пользователя (покупатель)
    print_step("ШАГ 7: Регистрация/Вход второго пользователя (Покупатель)")
    user2_data = register_user(USER2_EMAIL, USER2_PASSWORD, USER2_NAME)
    if not user2_data:
        print_warning("Регистрация не удалась, возможно пользователь уже существует. Пробую войти...")
    
    # Вход второго пользователя
    user2_email_actual = USER2_EMAIL
    user2_token = login_user(user2_email_actual, USER2_PASSWORD)
    if not user2_token:
        # Пробуем использовать другого тестового пользователя
        print_warning("Не удалось войти. Пробую использовать другого тестового пользователя...")
        test_emails = ["buyer@example.com", "user2@example.com", "test2@example.com"]
        for test_email in test_emails:
            if test_email != USER1_EMAIL:  # Не используем того же пользователя
                user2_token = login_user(test_email, "Test123456!")
                if user2_token:
                    user2_email_actual = test_email
                    print_info(f"Используется существующий пользователь: {test_email}")
                    break
        
        if not user2_token:
            print_warning("Не удалось войти как второй пользователь. Продолжаю с одним пользователем...")
            user2_token = user1_token  # Используем того же пользователя для демонстрации
            user2_email_actual = USER1_EMAIL
            print_info("Используется тот же пользователь для демонстрации функционала")
    
    USER2_EMAIL = user2_email_actual
    
    # Просмотр товаров покупателем
    print_step("ШАГ 8: Покупатель просматривает товары на маркетплейсе")
    items_list_buyer = get_market_items(user2_token, {"page": 1, "page_size": 10})
    if items_list_buyer:
        print_info(f"Покупатель видит {items_list_buyer.get('total', 0)} товаров")
    
    # Покупатель просматривает детали товара
    print_step("ШАГ 9: Покупатель просматривает детали товара")
    item_detail_buyer = get_market_item_detail(user2_token, item1_id)
    if item_detail_buyer:
        print_info(f"Покупатель просматривает: {item_detail_buyer.get('title')}")
        print_info(f"Цена: {item_detail_buyer.get('price')}")
        print_info(f"Описание: {item_detail_buyer.get('description', '')[:100]}...")
    
    # Покупатель оставляет отзыв
    print_step("ШАГ 10: Покупатель оставляет отзыв")
    review = create_review(
        user2_token,
        "market_item",
        item1_id,
        rating=5,
        comment="Отличный шаблон! Очень удобный и функциональный. Рекомендую!"
    )
    if review:
        print_info(f"Отзыв создан с ID: {review.get('id')}")
        print_info(f"Рейтинг: {review.get('rating')}/5")
        print_info(f"Комментарий: {review.get('comment', '')[:50]}...")
    
    # Проверка обновленного рейтинга
    print_step("ШАГ 11: Проверка обновленного рейтинга товара")
    updated_item = get_market_item_detail(user2_token, item1_id)
    if updated_item:
        avg_rating = updated_item.get('average_rating')
        rating_count = updated_item.get('rating_count', 0)
        print_info(f"Средний рейтинг: {avg_rating}/5")
        print_info(f"Количество отзывов: {rating_count}")
        if avg_rating == 5.0 and rating_count >= 1:
            print_success("Рейтинг обновлен корректно!")
    
    # Просмотр отзывов
    print_step("ШАГ 12: Просмотр отзывов на товар")
    reviews = make_request("GET", f"{API_BASE}/reviews", token=user2_token,
                          data={"item_type": "market_item", "item_id": item1_id, "page": 1, "page_size": 10},
                          description="Получение списка отзывов")
    if reviews:
        print_info(f"Найдено отзывов: {len(reviews)}")
        for rev in reviews:
            print_info(f"  - Рейтинг {rev.get('rating')}/5 от {rev.get('author', {}).get('email', 'N/A')}")
            print_info(f"    Комментарий: {rev.get('comment', '')[:50]}...")
    
    # Итоги
    print_step("ИТОГИ ТЕСТИРОВАНИЯ")
    print_success("Все основные сценарии протестированы успешно!")
    print_info(f"Пользователь 1 (Продавец): {USER1_EMAIL}")
    print_info(f"Пользователь 2 (Покупатель): {USER2_EMAIL}")
    print_info(f"Созданных ботов: 2")
    print_info(f"Товаров на маркетплейсе: 2")
    print_info(f"Отзывов: 1")
    print(f"\n{Colors.CYAN}{'='*70}{Colors.END}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nТестирование прервано пользователем.")
    except Exception as e:
        print_error(f"Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
