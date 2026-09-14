from sqlalchemy import Column, Integer, String, DateTime
from core.database import Base
from core.timestamps import utcnow

class NetworkIncident(Base):
    __tablename__ = "network_incidents"

    id = Column(Integer, primary_key=True, index=True)
    terminal_id = Column(String, nullable=False, index=True)
    incident_type = Column(String, nullable=False)  # disconnect, slow, reconnect
    user_logged = Column(String, nullable=True)
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)
