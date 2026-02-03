"""
Test script for Marketplace API endpoints
Run this script to test all marketplace functionality
"""
import sys
import os
import requests
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://localhost:8001"
API_BASE = f"{BASE_URL}/api/market"

# Test user credentials (you need to create a test user first)
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "Test123456!"

def get_auth_token():
    """Get authentication token"""
    login_url = f"{BASE_URL}/auth/login"
    response = requests.post(login_url, json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"Login failed: {response.status_code} - {response.text}")
        return None

def test_endpoint(method, url, token=None, data=None, description=""):
    """Test an API endpoint"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    print(f"\n{'='*60}")
    print(f"Testing: {description}")
    print(f"{method} {url}")
    
    if method == "GET":
        response = requests.get(url, headers=headers)
    elif method == "POST":
        response = requests.post(url, headers=headers, json=data)
    elif method == "PUT":
        response = requests.put(url, headers=headers, json=data)
    elif method == "DELETE":
        response = requests.delete(url, headers=headers)
    
    print(f"Status: {response.status_code}")
    if response.status_code < 400:
        try:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2, ensure_ascii=False)[:500]}")
            return result
        except:
            print(f"Response: {response.text[:500]}")
            return response.text
    else:
        print(f"Error: {response.text}")
        return None

def main():
    print("="*60)
    print("Marketplace API Test Suite")
    print("="*60)
    
    # Get auth token
    print("\n1. Authenticating...")
    token = get_auth_token()
    if not token:
        print("Failed to authenticate. Please check credentials.")
        return
    
    print(f"Token obtained: {token[:50]}...")
    
    # Test 1: List market items
    test_endpoint("GET", f"{API_BASE}/items", token, description="List market items")
    
    # Test 2: Create market item (template)
    item_data = {
        "item_type": "template",
        "source_bot_id": 1,  # You need to have a bot with ID 1
        "title": "Test Template",
        "description": "Test description",
        "price": 100.00,
        "category": "test",
        "tags": ["test", "template"],
        "is_published": True
    }
    created_item = test_endpoint("POST", f"{API_BASE}/items", token, item_data, 
                                description="Create market item")
    
    item_id = None
    if created_item:
        item_id = created_item.get("id")
    
    # Test 3: Get market item
    if item_id:
        test_endpoint("GET", f"{API_BASE}/items/{item_id}", token, 
                     description="Get market item details")
    
    # Test 4: Create market order
    order_data = {
        "title": "Test Order",
        "description": "Test order description",
        "budget_min": 500.00,
        "budget_max": 1000.00,
        "category": "development",
        "skills": ["python", "telegram"]
    }
    created_order = test_endpoint("POST", f"{API_BASE}/orders", token, order_data,
                                  description="Create market order")
    
    order_id = None
    if created_order:
        order_id = created_order.get("id")
    
    # Test 5: List orders
    test_endpoint("GET", f"{API_BASE}/orders", token, description="List market orders")
    
    # Test 6: Create freelancer profile
    freelancer_data = {
        "title": "Telegram Bot Developer",
        "description": "Experienced developer",
        "hourly_rate": 50.00,
        "skills": ["python", "telegram", "fastapi"]
    }
    created_freelancer = test_endpoint("POST", f"{API_BASE}/freelancers", token, freelancer_data,
                                      description="Create freelancer profile")
    
    # Test 7: List freelancers
    test_endpoint("GET", f"{API_BASE}/freelancers", token, description="List freelancers")
    
    # Test 8: Create review (if we have an item)
    if item_id:
        review_data = {
            "item_type": "market_item",
            "item_id": item_id,
            "rating": 5,
            "comment": "Great item!"
        }
        test_endpoint("POST", f"{API_BASE}/reviews", token, review_data,
                     description="Create review")
    
    print("\n" + "="*60)
    print("Test suite completed!")
    print("="*60)

if __name__ == "__main__":
    main()
