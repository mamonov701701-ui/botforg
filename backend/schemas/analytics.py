from pydantic import BaseModel
from typing import List

class AnalyticsOverviewOut(BaseModel):
    total_users: int
    total_templates: int
    total_purchases: int
    total_comments: int
    total_ratings: int
    average_rating_global: float

class TemplateAnalyticsOut(BaseModel):
    template_id: int
    name: str
    total_purchases: int
    average_rating: float
    rating_count: int
    comment_count: int 
