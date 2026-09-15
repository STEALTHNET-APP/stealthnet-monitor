import unittest
from scripts.xray_collector import observation


class XrayCollectorTest(unittest.TestCase):
    def test_ipv4_user_and_transport_without_browsing_destinations(self):
        event = observation('2026/09/15 16:13:09.341025 from 192.0.2.4:51234 accepted tcp:private.example:443 [inbound >> DIRECT] email: 12345', 1000)
        self.assertEqual((event['ip'], event['user'], event['protocol']), ('192.0.2.4', '12345', 'TCP'))
        self.assertNotIn('private.example', str(event))
        next_event = observation('from tcp:192.0.2.4:62345 accepted tcp:other.example:80 [in >> out] email: 12345', 2000)
        self.assertEqual(event['id'], next_event['id'])
        self.assertEqual(next_event['time'], 2000)

    def test_ipv6_and_non_access_lines(self):
        event = observation('from [2001:db8::1]:1234 accepted udp:192.0.2.8:53 [in >> out] email: user-name', 1000)
        self.assertEqual(event['ip'], '2001:db8::1')
        self.assertEqual(event['protocol'], 'UDP')
        self.assertIsNone(observation('unrelated warning', 1000))
        self.assertIsNone(observation('from invalid accepted tcp:example:443 email: user', 1000))
