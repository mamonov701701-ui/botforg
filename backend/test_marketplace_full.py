"""
Полное тестирование Marketplace API
Проверяет все endpoints и функциональность
"""
import sys
import os
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8001"
API_BASE = f"{BASE_URL}/api/market"

# Тестовые данные
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "Test123456!"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}[OK] {msg}{Colors.END}")

def print_error(msg):
    print(f"{Colors.RED}[ERROR] {msg}{Colors.END}")

def print_info(msg):
    print(f"{Colors.BLUE}[INFO] {msg}{Colors.END}")

def print_warning(msg):
    print(f"{Colors.YELLOW}[WARN] {msg}{Colors.END}")

def get_auth_token():
    """Получить токен аутентификации"""
    # Пробуем разные пути для логина
    login_urls = [
        f"{BASE_URL}/auth/login",
        f"{BASE_URL}/login",
        f"{BASE_URL}/api/auth/login"
    ]
    
    for login_url in login_urls:
        try:
            response = requests.post(login_url, json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            }, timeout=5)
            if response.status_code == 200:
                token = response.json().get("access_token")
                print_success(f"Аутентификация успешна через {login_url}")
                return token
        except:
            continue
    
    print_warning(f"Не удалось аутентифицироваться. Пробовал: {', '.join(login_urls)}")
    return None

def test_endpoint(method, url, token=None, data=None, expected_status=200, description=""):
    """Тестировать endpoint"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=5)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=5)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data, timeout=5)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=5)
        else:
            print_error(f"Неизвестный метод: {method}")
            return None
        
        if response.status_code == expected_status:
            print_success(f"{description} - Status: {response.status_code}")
            try:
                return response.json()
            except:
                return response.text
        else:
            print_error(f"{description} - Status: {response.status_code}, Response: {response.text[:200]}")
            return None
    except requests.exceptions.ConnectionError:
        print_error(f"{description} - Не удалось подключиться к серверу")
        return None
    except Exception as e:
        print_error(f"{description} - Ошибка: {e}")
        return None

def main():
    print("\n" + "="*70)
    print(" " * 20 + "MARKETPLACE API TEST SUITE")
    print("="*70 + "\n")
    
    # 1. Проверка доступности сервера
    print_info("1. Проверка доступности сервера...")
    health = test_endpoint("GET", f"{BASE_URL}/health", description="Health check")
    if not health:
        print_error("Сервер недоступен. Убедитесь, что backend запущен на порту 8001")
        return
    
    # 2. Аутентификация
    print_info("\n2. Аутентификация...")
    token = get_auth_token()
    if not token:
        print_warning("Не удалось получить токен. Продолжаю тестирование без аутентификации...")
        token = None
    
    # 3. Тестирование Market Items
    print_info("\n3. Тестирование Market Items...")
    
    # 3.1. Список товаров (публичный)
    items_list = test_endpoint("GET", f"{API_BASE}/items?page=1&page_size=5", 
                              description="GET /items - Список товаров")
    
    # 3.2. Создание товара (требует аутентификации)
    if token:
        item_data = {
            "item_type": "template",
            "source_bot_id": 1,  # Предполагаем, что есть бот с ID 1
            "title": f"Test Template {datetime.now().strftime('%H%M%S')}",
            "description": "Test description for marketplace item",
            "price": 100.00,
            "category": "test",
            "tags": ["test", "template"],
            "is_published": True
        }
        created_item = test_endpoint("POST", f"{API_BASE}/items", token, item_data,
                                    expected_status=201, description="POST /items - Создание товара")
        
        item_id = None
        if created_item:
            item_id = created_item.get("id")
            print_info(f"Создан товар с ID: {item_id}")
            
            # 3.3. Получение товара
            test_endpoint("GET", f"{API_BASE}/items/{item_id}", token,
                         description=f"GET /items/{item_id} - Детали товара")
            
            # 3.4. Обновление товара
            update_data = {
                "title": f"Updated Test Template {datetime.now().strftime('%H%M%S')}",
                "price": 150.00
            }
            test_endpoint("PUT", f"{API_BASE}/items/{item_id}", token, update_data,
                         description=f"PUT /items/{item_id} - Обновление товара")
            
            # 3.5. Удаление товара
            test_endpoint("DELETE", f"{API_BASE}/items/{item_id}", token,
                         expected_status=204, description=f"DELETE /items/{item_id} - Удаление товара")
    else:
        print_warning("Пропущены тесты создания/обновления/удаления товаров (требуется аутентификация)")
    
    # 4. Тестирование Market Orders
    print_info("\n4. Тестирование Market Orders...")
    
    # 4.1. Список заказов
    orders_list = test_endpoint("GET", f"{API_BASE}/orders?page=1&page_size=5",
                               description="GET /orders - Список заказов")
    
    # 4.2. Создание заказа
    if token:
        order_data = {
            "title": f"Test Order {datetime.now().strftime('%H%M%S')}",
            "description": "Test order description for marketplace",
            "budget_min": 500.00,
            "budget_max": 1000.00,
            "category": "development",
            "skills": ["python", "telegram"]
        }
        created_order = test_endpoint("POST", f"{API_BASE}/orders", token, order_data,
                                     expected_status=201, description="POST /orders - Создание заказа")
        
        order_id = None
        if created_order:
            order_id = created_order.get("id")
            print_info(f"Создан заказ с ID: {order_id}")
            
            # 4.3. Получение заказа
            test_endpoint("GET", f"{API_BASE}/orders/{order_id}", token,
                         description=f"GET /orders/{order_id} - Детали заказа")
    else:
        print_warning("Пропущены тесты создания заказов (требуется аутентификация)")
    
    # 5. Тестирование Freelancer Profiles
    print_info("\n5. Тестирование Freelancer Profiles...")
    
    # 5.1. Список исполнителей
    freelancers_list = test_endpoint("GET", f"{API_BASE}/freelancers?page=1&page_size=5",
                                    description="GET /freelancers - Список исполнителей")
    
    # 5.2. Создание профиля исполнителя
    if token:
        freelancer_data = {
            "title": "Telegram Bot Developer",
            "description": "Experienced developer specializing in Telegram bots",
            "hourly_rate": 50.00,
            "skills": ["python", "telegram", "fastapi"]
        }
        created_freelancer = test_endpoint("POST", f"{API_BASE}/freelancers", token, freelancer_data,
                                          expected_status=201, description="POST /freelancers - Создание профиля")
        
        if created_freelancer:
            user_id = created_freelancer.get("user", {}).get("id")
            if user_id:
                # 5.3. Получение профиля
                test_endpoint("GET", f"{API_BASE}/freelancers/{user_id}", token,
                             description=f"GET /freelancers/{user_id} - Профиль исполнителя")
                
                # 5.4. Обновление профиля
                update_data = {
                    "title": "Senior Telegram Bot Developer",
                    "hourly_rate": 75.00
                }
                test_endpoint("PUT", f"{API_BASE}/freelancers/me", token, update_data,
                             description="PUT /freelancers/me - Обновление профиля")
    else:
        print_warning("Пропущены тесты создания профилей (требуется аутентификация)")
    
    # 6. Тестирование Reviews
    print_info("\n6. Тестирование Reviews...")
    
    if token and 'item_id' in locals() and item_id:
        review_data = {
            "item_type": "market_item",
            "item_id": item_id,
            "rating": 5,
            "comment": "Great item! Highly recommended."
        }
        created_review = test_endpoint("POST", f"{API_BASE}/reviews", token, review_data,
                                     expected_status=201, description="POST /reviews - Создание отзыва")
        
        if created_review:
            # 6.1. Список отзывов
            test_endpoint("GET", f"{API_BASE}/reviews?item_type=market_item&item_id={item_id}",
                         description="GET /reviews - Список отзывов")
    else:
        print_warning("Пропущены тесты отзывов (требуется аутентификация и созданный товар)")
    
    # 7. Тестирование фильтрации и поиска
    print_info("\n7. Тестирование фильтрации и поиска...")
    
    test_endpoint("GET", f"{API_BASE}/items?item_type=template&page=1&page_size=5",
                 description="GET /items - Фильтр по типу")
    
    test_endpoint("GET", f"{API_BASE}/items?search=test&page=1&page_size=5",
                 description="GET /items - Поиск")
    
    test_endpoint("GET", f"{API_BASE}/items?min_price=0&max_price=200&page=1&page_size=5",
                 description="GET /items - Фильтр по цене")
    
    test_endpoint("GET", f"{API_BASE}/orders?status=open&page=1&page_size=5",
                 description="GET /orders - Фильтр по статусу")
    
    # Итоги
    print("\n" + "="*70)
    print(" " * 25 + "ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print("="*70 + "\n")
    
    print_info("Проверьте результаты выше. Все тесты с [OK] прошли успешно.")
    print_info("Тесты с [ERROR] требуют внимания.")
    print_info("Тесты с [WARN] были пропущены (требуется аутентификация или данные).")
    print("\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nТестирование прервано пользователем.")
    except Exception as e:
        print_error(f"Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
